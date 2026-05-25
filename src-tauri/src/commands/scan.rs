use super::types::{DirEntryInfo, DirTree};
use chrono::{DateTime, Local};
use std::fs;
use std::path::{Path, PathBuf};
use std::time::SystemTime;

const MAX_DEPTH: usize = 5;

#[tauri::command]
pub async fn scan_directory(path: String) -> Result<DirTree, String> {
    let base = PathBuf::from(&path);
    if !base.exists() {
        return Err(format!("Directory not found: {}", path));
    }
    if !base.is_dir() {
        return Err(format!("Not a directory: {}", path));
    }

    let mut entries = Vec::new();
    scan_level(&base, &base, 0, &mut entries)?;
    entries.sort_by(|a, b| {
        a.relative_path
            .to_lowercase()
            .cmp(&b.relative_path.to_lowercase())
    });

    Ok(DirTree {
        base_dir: base.to_string_lossy().to_string(),
        entries,
        max_depth: MAX_DEPTH,
    })
}

fn scan_level(
    base: &Path,
    current: &Path,
    depth: usize,
    entries: &mut Vec<DirEntryInfo>,
) -> Result<(), String> {
    if depth > MAX_DEPTH {
        return Ok(());
    }

    let read_dir = fs::read_dir(current).map_err(|e| format!("Failed to read directory: {}", e))?;
    for item in read_dir {
        let item = item.map_err(|e| format!("Failed to read directory entry: {}", e))?;
        let path = item.path();
        let name = item.file_name().to_string_lossy().to_string();
        if name == ".ai-organizer-undo.json" {
            continue;
        }

        let metadata = item
            .metadata()
            .map_err(|e| format!("Failed to read metadata {}: {}", path.display(), e))?;
        let is_dir = metadata.is_dir();
        let relative_path = path
            .strip_prefix(base)
            .map_err(|e| format!("Failed to compute relative path: {}", e))?
            .to_string_lossy()
            .replace('\\', "/");
        let extension = path
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("")
            .to_string();
        let modified = metadata.modified().ok().map(format_time);

        entries.push(DirEntryInfo {
            name,
            relative_path,
            size: if is_dir { 0 } else { metadata.len() },
            extension,
            modified,
            is_dir,
            depth,
        });

        if is_dir && depth < MAX_DEPTH {
            scan_level(base, &path, depth + 1, entries)?;
        }
    }

    Ok(())
}

fn format_time(time: SystemTime) -> String {
    let dt: DateTime<Local> = time.into();
    dt.format("%Y-%m-%d %H:%M:%S").to_string()
}
