use std::{
    fs,
    path::{Component, Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};

use crate::types::{FileSnapshot, WorkspaceNode, WorkspaceSnapshot};

const MAX_DEPTH: usize = 12;
const MAX_FILES: usize = 2500;

fn now_ms() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|value| value.as_millis())
        .unwrap_or_default()
}

fn normalize_relative(relative: &str) -> Result<PathBuf, String> {
    let mut path = PathBuf::new();
    for component in Path::new(relative).components() {
        match component {
            Component::Normal(value) => path.push(value),
            Component::CurDir => {}
            Component::ParentDir | Component::RootDir | Component::Prefix(_) => {
                return Err("Path must stay inside the selected workspace".to_string());
            }
        }
    }
    Ok(path)
}

pub fn resolve_path(root: &str, relative: &str) -> Result<PathBuf, String> {
    let root_path = PathBuf::from(root);
    if relative.is_empty() || relative == "." {
        return Ok(root_path);
    }
    Ok(root_path.join(normalize_relative(relative)?))
}

fn modified_ms(metadata: &fs::Metadata) -> u128 {
    metadata
        .modified()
        .ok()
        .and_then(|value| value.duration_since(UNIX_EPOCH).ok())
        .map(|value| value.as_millis())
        .unwrap_or_default()
}

fn node_for(
    root: &Path,
    path: &Path,
    depth: usize,
    file_count: &mut usize,
) -> Result<WorkspaceNode, String> {
    let metadata = fs::metadata(path).map_err(|error| error.to_string())?;
    let relative_path = path
        .strip_prefix(root)
        .map_err(|error| error.to_string())?
        .to_string_lossy()
        .replace('\\', "/");
    let name = path
        .file_name()
        .map(|value| value.to_string_lossy().to_string())
        .unwrap_or_else(|| root.to_string_lossy().to_string());
    let is_directory = metadata.is_dir();

    if is_directory {
        let mut children = Vec::new();
        if depth < MAX_DEPTH {
            let mut entries = fs::read_dir(path)
                .map_err(|error| error.to_string())?
                .filter_map(Result::ok)
                .collect::<Vec<_>>();
            entries.sort_by_key(|entry| {
                let is_file = entry
                    .metadata()
                    .map(|value| value.is_file())
                    .unwrap_or(false);
                (!is_file, entry.file_name())
            });
            for entry in entries {
                if *file_count >= MAX_FILES {
                    break;
                }
                let entry_name = entry.file_name().to_string_lossy().to_string();
                if entry_name == "node_modules" || entry_name == ".git" || entry_name == "target" {
                    continue;
                }
                children.push(node_for(root, &entry.path(), depth + 1, file_count)?);
            }
        }
        Ok(WorkspaceNode {
            name,
            relative_path,
            kind: "directory".to_string(),
            size: 0,
            modified_ms: modified_ms(&metadata),
            children: Some(children),
        })
    } else {
        *file_count += 1;
        Ok(WorkspaceNode {
            name,
            relative_path,
            kind: "file".to_string(),
            size: metadata.len(),
            modified_ms: modified_ms(&metadata),
            children: None,
        })
    }
}

pub fn load_workspace(root: &str) -> Result<WorkspaceSnapshot, String> {
    let root_path = PathBuf::from(root);
    if !root_path.is_dir() {
        return Err("Selected workspace folder does not exist".to_string());
    }
    let mut file_count = 0;
    let mut root_node = node_for(&root_path, &root_path, 0, &mut file_count)?;
    let nodes = root_node.children.take().unwrap_or_default();
    Ok(WorkspaceSnapshot {
        root: root_path.to_string_lossy().to_string(),
        name: root_path
            .file_name()
            .map(|value| value.to_string_lossy().to_string())
            .unwrap_or_else(|| root_path.to_string_lossy().to_string()),
        nodes,
        file_count,
        updated_ms: now_ms(),
    })
}

pub fn read_file(root: &str, relative: &str) -> Result<FileSnapshot, String> {
    let path = resolve_path(root, relative)?;
    let metadata = fs::metadata(&path).map_err(|error| error.to_string())?;
    let content = fs::read_to_string(path).map_err(|error| error.to_string())?;
    Ok(FileSnapshot {
        content,
        modified_ms: modified_ms(&metadata),
    })
}

pub fn write_file(root: &str, relative: &str, content: &str) -> Result<(), String> {
    let path = resolve_path(root, relative)?;
    if !path.exists() {
        return Err("File no longer exists".to_string());
    }
    fs::write(path, content).map_err(|error| error.to_string())
}

pub fn create_entry(root: &str, parent: &str, name: &str, kind: &str) -> Result<(), String> {
    if name.trim().is_empty() || name.contains(['/', '\\']) || name == "." || name == ".." {
        return Err("Choose a valid file or folder name".to_string());
    }
    let parent_path = resolve_path(root, parent)?;
    let target = parent_path.join(name);
    if target.exists() {
        return Err("An item with that name already exists".to_string());
    }
    match kind {
        "directory" => fs::create_dir(&target).map_err(|error| error.to_string()),
        "file" => fs::write(&target, "").map_err(|error| error.to_string()),
        _ => Err("Unknown workspace entry type".to_string()),
    }
}

pub fn rename_entry(root: &str, relative: &str, new_name: &str) -> Result<(), String> {
    if new_name.trim().is_empty() || new_name.contains(['/', '\\']) {
        return Err("Choose a valid new name".to_string());
    }
    let source = resolve_path(root, relative)?;
    let parent = source
        .parent()
        .ok_or_else(|| "Cannot rename workspace root".to_string())?;
    let target = parent.join(new_name);
    if target.exists() {
        return Err("An item with that name already exists".to_string());
    }
    fs::rename(source, target).map_err(|error| error.to_string())
}

pub fn delete_entry(root: &str, relative: &str) -> Result<(), String> {
    let path = resolve_path(root, relative)?;
    if path == PathBuf::from(root) {
        return Err("The workspace root cannot be deleted".to_string());
    }
    let metadata = fs::metadata(&path).map_err(|error| error.to_string())?;
    if metadata.is_dir() {
        fs::remove_dir_all(path).map_err(|error| error.to_string())
    } else {
        fs::remove_file(path).map_err(|error| error.to_string())
    }
}
