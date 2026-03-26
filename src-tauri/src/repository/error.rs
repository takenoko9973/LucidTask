use std::error::Error;
use std::fmt::{Display, Formatter};

#[derive(Debug)]
pub enum RepositoryError {
    Io(std::io::Error),
    Serde(serde_json::Error),
    TaskNotFound(String),
    DuplicateTaskId(String),
    InvalidData(String),
}

impl Display for RepositoryError {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Io(err) => write!(f, "I/O error: {err}"),
            Self::Serde(err) => write!(f, "JSON serialization error: {err}"),
            Self::TaskNotFound(id) => write!(f, "Task not found: {id}"),
            Self::DuplicateTaskId(id) => write!(f, "Task ID already exists: {id}"),
            Self::InvalidData(message) => write!(f, "Invalid repository data: {message}"),
        }
    }
}

impl Error for RepositoryError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::Io(err) => Some(err),
            Self::Serde(err) => Some(err),
            Self::TaskNotFound(_) | Self::DuplicateTaskId(_) | Self::InvalidData(_) => None,
        }
    }
}

impl From<std::io::Error> for RepositoryError {
    fn from(value: std::io::Error) -> Self {
        Self::Io(value)
    }
}

impl From<serde_json::Error> for RepositoryError {
    fn from(value: serde_json::Error) -> Self {
        Self::Serde(value)
    }
}
