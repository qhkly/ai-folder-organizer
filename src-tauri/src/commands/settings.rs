use serde::{Deserialize, Serialize};
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Settings {
    pub api_key: String,
    pub last_dir: String,
    pub model: String,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            api_key: String::new(),
            last_dir: String::new(),
            model: "claude-opus-4-7".to_string(),
        }
    }
}

fn settings_path() -> Result<PathBuf, String> {
    dirs::config_dir()
        .ok_or_else(|| "Could not determine config directory".to_string())
        .map(|d| d.join("ai-folder-organizer").join("settings.json"))
}

#[tauri::command]
pub async fn load_settings() -> Result<Settings, String> {
    let path = settings_path()?;
    if !path.exists() {
        return Ok(Settings::default());
    }
    let raw = tokio::fs::read_to_string(&path)
        .await
        .map_err(|e| format!("Failed to read config: {}", e))?;
    serde_json::from_str(&raw).map_err(|e| format!("Failed to parse config: {}", e))
}

#[tauri::command]
pub async fn save_settings(settings: Settings) -> Result<(), String> {
    let path = settings_path()?;
    if let Some(parent) = path.parent() {
        tokio::fs::create_dir_all(parent)
            .await
            .map_err(|e| format!("Failed to create config directory: {}", e))?;
    }
    let json =
        serde_json::to_string_pretty(&settings).map_err(|e| format!("Failed to serialize config: {}", e))?;
    tokio::fs::write(&path, json)
        .await
        .map_err(|e| format!("Failed to save config: {}", e))
}
