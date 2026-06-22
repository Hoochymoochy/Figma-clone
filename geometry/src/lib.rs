use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub struct SnappedPosition {
    pub original_x: f64,
    pub original_y: f64,
    pub snapped_x: f64,
    pub snapped_y: f64,
}

#[wasm_bindgen]
impl SnappedPosition {
    pub fn new(x: f64, y: f64, grid_size: f64) -> SnappedPosition {
        let snapped_x = (x / grid_size).round() * grid_size;
        let snapped_y = (y / grid_size).round() * grid_size;
        SnappedPosition {
            original_x: x,
            original_y: y,
            snapped_x,
            snapped_y,
        }
    }
}
