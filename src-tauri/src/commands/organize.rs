use super::types::{FileOp, UndoManifest};
use chrono::Local;
use std::path::{Component, Path, PathBuf};
use tauri::{AppHandle, Emitter};

const UNDO_FILE: &str = ".ai-organizer-undo.json";

#[tauri::command]
pub async fn has_undo_manifest(base_dir: String) -> Result<bool, String> {
    Ok(Path::new(&base_dir).join(UNDO_FILE).exists())
}

#[tauri::command]
pub async fn execute_plan(
    app: AppHandle,
    operations: Vec<FileOp>,
    base_dir: String,
) -> Result<UndoManifest, String> {
    let base = normalize_base(&base_dir)?;
    if operations.is_empty() {
        return Err("没有可执行的整理操作".to_string());
    }

    let manifest_path = base.join(UNDO_FILE);
    if manifest_path.exists() {
        return Err("已存在撤销清单，请先撤销或手动处理 .ai-organizer-undo.json".to_string());
    }

    validate_operations(&base, &operations)?;

    let mut manifest = UndoManifest {
        base_dir: base.to_string_lossy().to_string(),
        timestamp: Local::now().to_rfc3339(),
        reverse_ops: Vec::new(),
    };

    for (idx, op) in operations.iter().enumerate() {
        app.emit(
            "exec_progress",
            format!("执行 {}/{}: {}", idx + 1, operations.len(), describe_op(op)),
        )
        .ok();
        apply_op(&base, op)?;
        if let Some(reverse) = reverse_for(op) {
            manifest.reverse_ops.insert(0, reverse);
            write_manifest(&manifest_path, &manifest)?;
        }
    }

    write_manifest(&manifest_path, &manifest)?;
    app.emit("exec_progress", "整理完成，撤销清单已保存。").ok();
    Ok(manifest)
}

#[tauri::command]
pub async fn undo_plan(app: AppHandle, base_dir: String) -> Result<(), String> {
    let base = normalize_base(&base_dir)?;
    let manifest_path = base.join(UNDO_FILE);
    if !manifest_path.exists() {
        return Err("没有找到撤销清单".to_string());
    }

    let raw = std::fs::read_to_string(&manifest_path)
        .map_err(|e| format!("读取撤销清单失败: {}", e))?;
    let manifest: UndoManifest =
        serde_json::from_str(&raw).map_err(|e| format!("解析撤销清单失败: {}", e))?;
    validate_operations(&base, &manifest.reverse_ops)?;

    for (idx, op) in manifest.reverse_ops.iter().enumerate() {
        app.emit(
            "exec_progress",
            format!(
                "撤销 {}/{}: {}",
                idx + 1,
                manifest.reverse_ops.len(),
                describe_op(op)
            ),
        )
        .ok();
        apply_op(&base, op)?;
    }

    std::fs::remove_file(&manifest_path).map_err(|e| format!("删除撤销清单失败: {}", e))?;
    app.emit("exec_progress", "撤销完成。").ok();
    Ok(())
}

fn normalize_base(base_dir: &str) -> Result<PathBuf, String> {
    let base = PathBuf::from(base_dir);
    if !base.exists() || !base.is_dir() {
        return Err(format!("目录不存在或不是目录: {}", base_dir));
    }
    base.canonicalize()
        .map_err(|e| format!("解析目录真实路径失败: {}", e))
}

fn write_manifest(path: &Path, manifest: &UndoManifest) -> Result<(), String> {
    let json = serde_json::to_string_pretty(manifest)
        .map_err(|e| format!("序列化撤销清单失败: {}", e))?;
    std::fs::write(path, json).map_err(|e| format!("保存撤销清单失败: {}", e))
}

fn validate_operations(base: &Path, operations: &[FileOp]) -> Result<(), String> {
    for op in operations {
        match op.op_type.as_str() {
            "mkdir" | "rmdir" => {
                let path = op
                    .path
                    .as_ref()
                    .ok_or_else(|| format!("{} 操作缺少 path", op.op_type))?;
                let _ = safe_join(base, path)?;
            }
            "move" | "rename" => {
                let from = op
                    .from
                    .as_ref()
                    .ok_or_else(|| format!("{} 操作缺少 from", op.op_type))?;
                let to = op
                    .to
                    .as_ref()
                    .ok_or_else(|| format!("{} 操作缺少 to", op.op_type))?;
                let _ = safe_join(base, from)?;
                let _ = safe_join(base, to)?;
            }
            other => return Err(format!("不支持的操作类型: {}", other)),
        }
    }
    Ok(())
}

fn apply_op(base: &Path, op: &FileOp) -> Result<(), String> {
    match op.op_type.as_str() {
        "mkdir" => {
            let path = safe_join(base, required_path(op)?)?;
            std::fs::create_dir_all(&path)
                .map_err(|e| format!("创建目录失败 {}: {}", path.display(), e))
        }
        "rmdir" => {
            let path = safe_join(base, required_path(op)?)?;
            if path.exists() {
                std::fs::remove_dir(&path)
                    .map_err(|e| format!("删除空目录失败 {}: {}", path.display(), e))?;
            }
            Ok(())
        }
        "move" | "rename" => {
            let from = safe_join(base, required_from(op)?)?;
            let to = safe_join(base, required_to(op)?)?;
            if !from.exists() {
                return Err(format!("源路径不存在: {}", from.display()));
            }
            if to.exists() {
                return Err(format!("目标路径已存在，已停止以避免覆盖: {}", to.display()));
            }
            if let Some(parent) = to.parent() {
                std::fs::create_dir_all(parent)
                    .map_err(|e| format!("创建目标父目录失败 {}: {}", parent.display(), e))?;
            }
            std::fs::rename(&from, &to)
                .map_err(|e| format!("移动失败 {} -> {}: {}", from.display(), to.display(), e))
        }
        other => Err(format!("不支持的操作类型: {}", other)),
    }
}

fn reverse_for(op: &FileOp) -> Option<FileOp> {
    match op.op_type.as_str() {
        "mkdir" => Some(FileOp {
            op_type: "rmdir".to_string(),
            from: None,
            to: None,
            path: op.path.clone(),
        }),
        "move" | "rename" => Some(FileOp {
            op_type: "move".to_string(),
            from: op.to.clone(),
            to: op.from.clone(),
            path: None,
        }),
        _ => None,
    }
}

fn required_path(op: &FileOp) -> Result<&str, String> {
    op.path
        .as_deref()
        .ok_or_else(|| format!("{} 操作缺少 path", op.op_type))
}

fn required_from(op: &FileOp) -> Result<&str, String> {
    op.from
        .as_deref()
        .ok_or_else(|| format!("{} 操作缺少 from", op.op_type))
}

fn required_to(op: &FileOp) -> Result<&str, String> {
    op.to
        .as_deref()
        .ok_or_else(|| format!("{} 操作缺少 to", op.op_type))
}

fn safe_join(base: &Path, relative: &str) -> Result<PathBuf, String> {
    let trimmed = relative.trim().trim_start_matches("./");
    if trimmed.is_empty() {
        return Err("路径不能为空".to_string());
    }
    let rel_path = Path::new(trimmed);
    if rel_path.is_absolute() {
        return Err(format!("不允许绝对路径: {}", relative));
    }
    if trimmed.starts_with('~') {
        return Err(format!("不允许 home 简写路径: {}", relative));
    }
    for component in rel_path.components() {
        match component {
            Component::Normal(_) => {}
            _ => return Err(format!("不安全路径: {}", relative)),
        }
    }
    Ok(base.join(rel_path))
}

fn describe_op(op: &FileOp) -> String {
    match op.op_type.as_str() {
        "mkdir" | "rmdir" => format!("{} {}", op.op_type, op.path.as_deref().unwrap_or("")),
        "move" | "rename" => format!(
            "{} {} -> {}",
            op.op_type,
            op.from.as_deref().unwrap_or(""),
            op.to.as_deref().unwrap_or("")
        ),
        other => other.to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn safe_join_accepts_plain_relative_paths() {
        let base = Path::new("/tmp/example");
        let resolved = safe_join(base, "docs/report.txt").unwrap();
        assert_eq!(resolved, PathBuf::from("/tmp/example/docs/report.txt"));
    }

    #[test]
    fn safe_join_rejects_parent_traversal() {
        let base = Path::new("/tmp/example");
        assert!(safe_join(base, "../outside.txt").is_err());
        assert!(safe_join(base, "docs/../../outside.txt").is_err());
    }

    #[test]
    fn safe_join_rejects_absolute_and_home_paths() {
        let base = Path::new("/tmp/example");
        assert!(safe_join(base, "/tmp/outside.txt").is_err());
        assert!(safe_join(base, "~/outside.txt").is_err());
    }
}
