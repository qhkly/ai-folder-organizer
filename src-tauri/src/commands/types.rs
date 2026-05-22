use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DirEntryInfo {
    pub name: String,
    pub relative_path: String,
    pub size: u64,
    pub extension: String,
    pub modified: Option<String>,
    pub is_dir: bool,
    pub depth: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DirTree {
    pub base_dir: String,
    pub entries: Vec<DirEntryInfo>,
    pub max_depth: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileOp {
    #[serde(rename = "type", alias = "op_type")]
    pub op_type: String,
    pub from: Option<String>,
    pub to: Option<String>,
    pub path: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AiPlan {
    pub description: String,
    pub operations: Vec<FileOp>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UndoManifest {
    pub base_dir: String,
    pub timestamp: String,
    pub reverse_ops: Vec<FileOp>,
}
