#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
pub struct Layer {
    pub id: String,
    pub name: String,
    pub z_order: i32,
    pub visible: bool,
}

impl Layer {
    pub fn default_layer() -> Self {
        Self {
            id: "default".into(),
            name: "Default".into(),
            z_order: 0,
            visible: true,
        }
    }
}
