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
) -> Result<AiPlan, String> {
    if api_key.trim().is_empty() {
        return Err("请先在设置中填写 Anthropic API Key".to_string());
    }

    let model = if model.trim().is_empty() {
        "claude-opus-4-7".to_string()
    } else {
        model.trim().to_string()
    };

    let _ = app.emit("ai_output", "正在准备目录摘要...");
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

    let system = r#"你是文件整理专家。你必须只输出严格 JSON，不要输出 Markdown。
JSON 结构必须是：
{
  "description": "简短说明整理策略",
  "operations": [
    {"type": "mkdir", "path": "Documents"},
    {"type": "move", "from": "a.txt", "to": "Documents/a.txt"},
    {"type": "rename", "from": "old.txt", "to": "new.txt"}
  ]
}
规则：
- 所有路径必须是相对用户所选目录的相对路径。
- 不允许使用绝对路径、..、~、空路径或目录外路径。
- 只规划 mkdir、move、rename，不要删除文件。
- 不确定时保持保守，宁可少移动。
- 避免覆盖已有文件，目标路径要清晰且可读。"#;

    let user = json!({
        "base_dir": tree.base_dir,
        "max_depth": tree.max_depth,
        "entry_count": tree.entries.len(),
        "entries": compact_entries,
    });

    let _ = app.emit("ai_output", format!("正在调用 Anthropic 模型: {}", model));
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
                    "content": format!("请分析这个目录并返回整理计划 JSON：\n{}", user)
                }
            ]
        }))
        .send()
        .await
        .map_err(|e| format!("请求 Anthropic API 失败: {}", e))?;

    let status = response.status();
    let body = response
        .text()
        .await
        .map_err(|e| format!("读取 AI 响应失败: {}", e))?;

    if !status.is_success() {
        let _ = app.emit("ai_output", format!("AI 请求失败: {}", status));
        return Err(format!("Anthropic API 返回 {}: {}", status, body));
    }

    let value: serde_json::Value =
        serde_json::from_str(&body).map_err(|e| format!("解析 Anthropic 响应失败: {}", e))?;
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
        .ok_or_else(|| "Anthropic 响应中没有文本内容".to_string())?;

    let _ = app.emit("ai_output", "AI 已返回整理方案，正在解析 JSON...");
    let plan = parse_plan_text(&text)?;
    let _ = app.emit(
        "ai_output",
        format!("整理方案解析完成，共 {} 个操作。", plan.operations.len()),
    );
    Ok(plan)
}

fn parse_plan_text(text: &str) -> Result<AiPlan, String> {
    if let Ok(plan) = serde_json::from_str::<AiPlan>(text.trim()) {
        return Ok(plan);
    }

    let start = text
        .find('{')
        .ok_or_else(|| "AI 响应不是 JSON：找不到起始 {".to_string())?;
    let end = text
        .rfind('}')
        .ok_or_else(|| "AI 响应不是 JSON：找不到结束 }".to_string())?;
    serde_json::from_str::<AiPlan>(&text[start..=end])
        .map_err(|e| format!("解析整理计划 JSON 失败: {}", e))
}
