use super::types::{AiPlan, DirTree};
use reqwest::Client;
use serde_json::json;
use tauri::{AppHandle, Emitter};

#[tauri::command]
pub async fn analyze_with_ai(
    app: AppHandle,
    tree: DirTree,
    api_key: String,
    model: String,
    lang: Option<String>,
) -> Result<AiPlan, String> {
    if api_key.trim().is_empty() {
        return Err("Please enter your Anthropic API Key in Settings".to_string());
    }

    let model = if model.trim().is_empty() {
        "claude-opus-4-7".to_string()
    } else {
        model.trim().to_string()
    };

    let use_chinese = lang.as_deref().unwrap_or("en-US").starts_with("zh");
    let lang_instruction = if use_chinese {
        "Write the \"description\" field in Simplified Chinese."
    } else {
        "Write the \"description\" field in English."
    };

    let _ = app.emit("ai_output", r#"{"key":"event.ai.preparing"}"#);
    let compact_entries: Vec<_> = tree
        .entries
        .iter()
        .take(1200)
        .map(|e| {
            json!({
                "path": e.relative_path,
                "name": e.name,
                "size": e.size,
                "extension": e.extension,
                "is_dir": e.is_dir,
                "depth": e.depth,
                "modified": e.modified,
            })
        })
        .collect();

    let system = format!(r#"You are a file organization expert. Output only strict JSON, no Markdown.
JSON structure must be:
{{
  "description": "brief strategy description",
  "operations": [
    {{"type": "mkdir", "path": "Documents"}},
    {{"type": "move", "from": "a.txt", "to": "Documents/a.txt"}},
    {{"type": "rename", "from": "old.txt", "to": "new.txt"}}
  ]
}}
Rules:
- All paths must be relative to the user-selected directory.
- Absolute paths, .., ~, empty paths, or paths outside the base directory are not allowed.
- Only plan mkdir, move, rename operations. Never delete files.
- When in doubt, be conservative and move fewer files.
- Avoid overwriting existing files; destination paths must be clear and readable.
- {}"#, lang_instruction);

    let user = json!({
        "base_dir": tree.base_dir,
        "max_depth": tree.max_depth,
        "entry_count": tree.entries.len(),
        "entries": compact_entries,
    });

    let _ = app.emit("ai_output", json!({"key": "event.ai.calling_model", "params": {"model": &model}}).to_string());
    let client = Client::new();
    let response = client
        .post("https://api.anthropic.com/v1/messages")
        .header("x-api-key", api_key.trim())
        .header("anthropic-version", "2023-06-01")
        .json(&json!({
            "model": model,
            "max_tokens": 4096,
            "temperature": 0.2,
            "system": system,
            "messages": [
                {
                    "role": "user",
                    "content": format!("Analyze this directory and return the organization plan as JSON:\n{}", user)
                }
            ]
        }))
        .send()
        .await
        .map_err(|e| format!("Anthropic API request failed: {}", e))?;

    let status = response.status();
    let body = response
        .text()
        .await
        .map_err(|e| format!("Failed to read AI response: {}", e))?;

    if !status.is_success() {
        let _ = app.emit("ai_output", json!({"key": "event.ai.request_failed", "params": {"status": status.as_u16()}}).to_string());
        return Err(format!("Anthropic API returned {}: {}", status, body));
    }

    let value: serde_json::Value =
        serde_json::from_str(&body).map_err(|e| format!("Failed to parse Anthropic response: {}", e))?;
    let text = value["content"]
        .as_array()
        .and_then(|items| {
            items
                .iter()
                .filter_map(|item| item["text"].as_str())
                .collect::<Vec<_>>()
                .first()
                .map(|s| (*s).to_string())
        })
        .ok_or_else(|| "No text content in Anthropic response".to_string())?;

    let _ = app.emit("ai_output", r#"{"key":"event.ai.parsing"}"#);
    let plan = parse_plan_text(&text)?;
    let _ = app.emit("ai_output", json!({"key": "event.ai.parsed", "params": {"count": plan.operations.len()}}).to_string());
    Ok(plan)
}

fn parse_plan_text(text: &str) -> Result<AiPlan, String> {
    if let Ok(plan) = serde_json::from_str::<AiPlan>(text.trim()) {
        return Ok(plan);
    }

    let start = text
        .find('{')
        .ok_or_else(|| "AI response is not JSON: missing opening {".to_string())?;
    let end = text
        .rfind('}')
        .ok_or_else(|| "AI response is not JSON: missing closing }".to_string())?;
    serde_json::from_str::<AiPlan>(&text[start..=end])
        .map_err(|e| format!("Failed to parse plan JSON: {}", e))
}
