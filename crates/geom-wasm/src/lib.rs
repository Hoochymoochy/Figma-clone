use geom_core::{snap_to_grid, Scene as CoreScene, SnappedPosition as CoreSnappedPosition};
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub struct SnappedPosition {
    inner: CoreSnappedPosition,
}

#[wasm_bindgen]
impl SnappedPosition {
    #[wasm_bindgen(constructor)]
    pub fn new(x: f64, y: f64, grid_size: f64) -> SnappedPosition {
        SnappedPosition {
            inner: snap_to_grid(x, y, grid_size),
        }
    }

    #[wasm_bindgen(getter)]
    pub fn original_x(&self) -> f64 {
        self.inner.original_x
    }

    #[wasm_bindgen(getter)]
    pub fn original_y(&self) -> f64 {
        self.inner.original_y
    }

    #[wasm_bindgen(getter)]
    pub fn snapped_x(&self) -> f64 {
        self.inner.snapped_x
    }

    #[wasm_bindgen(getter)]
    pub fn snapped_y(&self) -> f64 {
        self.inner.snapped_y
    }
}

#[wasm_bindgen]
pub struct Scene {
    inner: geom_core::Scene,
}

#[wasm_bindgen]
impl Scene {
    #[wasm_bindgen(constructor)]
    pub fn new(grid_size: f64) -> Scene {
        Scene {
            inner: CoreScene::new(grid_size),
        }
    }

    pub fn import_from_json(&mut self, json: &str) -> Result<(), JsValue> {
        self.inner
            .import_from_json(json)
            .map_err(|e| JsValue::from_str(&e))
    }

    pub fn import_shapes_from_json(&mut self, json: &str) -> Result<(), JsValue> {
        self.inner
            .import_shapes_from_json(json)
            .map_err(|e| JsValue::from_str(&e))
    }

    pub fn export_to_json(&self) -> Result<String, JsValue> {
        self.inner
            .export_to_json()
            .map_err(|e| JsValue::from_str(&e))
    }

    pub fn export_shapes_json(&self) -> Result<String, JsValue> {
        self.inner
            .export_shapes_json()
            .map_err(|e| JsValue::from_str(&e))
    }

    pub fn export_routes_json(&self) -> Result<String, JsValue> {
        self.inner
            .export_routes_json()
            .map_err(|e| JsValue::from_str(&e))
    }

    pub fn add_shape_json(&mut self, shape_json: &str) -> Result<(), JsValue> {
        self.inner
            .add_shape_json(shape_json)
            .map_err(|e| JsValue::from_str(&e))
    }

    pub fn remove_shape(&mut self, id: &str) -> bool {
        self.inner.remove_shape(id)
    }

    pub fn remove_shapes_json(&mut self, ids_json: &str) -> Result<(), JsValue> {
        let ids: Vec<String> = serde_json::from_str(ids_json)
            .map_err(|e| JsValue::from_str(&format!("invalid ids JSON: {e}")))?;
        self.inner.remove_shapes(&ids);
        Ok(())
    }

    pub fn update_shape(&mut self, id: &str, patch_json: &str) -> Result<(), JsValue> {
        self.inner
            .update_shape(id, patch_json)
            .map_err(|e| JsValue::from_str(&e))
    }

    pub fn hit_test(
        &self,
        x: f64,
        y: f64,
        vertex_radius: f64,
        edit_shape_id: Option<String>,
    ) -> Result<String, JsValue> {
        let edit_ref = edit_shape_id.as_deref();
        match self.inner.hit_test(x, y, vertex_radius, edit_ref) {
            Some(result) => serde_json::to_string(&result)
                .map_err(|e| JsValue::from_str(&format!("serialize hit: {e}"))),
            None => Ok("null".into()),
        }
    }

    pub fn nearest_shape(&self, x: f64, y: f64) -> Result<String, JsValue> {
        match self.inner.nearest_shape(x, y) {
            Some((id, distance)) => {
                let value = serde_json::json!({ "shape_id": id, "distance": distance });
                Ok(value.to_string())
            }
            None => Ok("null".into()),
        }
    }

    pub fn measure_distance(&self, x1: f64, y1: f64, x2: f64, y2: f64) -> Result<String, JsValue> {
        let result = self.inner.measure_distance(x1, y1, x2, y2);
        serde_json::to_string(&result)
            .map_err(|e| JsValue::from_str(&format!("serialize measure: {e}")))
    }

    pub fn shape_bounds(&self, id: &str) -> Result<String, JsValue> {
        match self.inner.shape_bounds_json(id) {
            Some(json) => Ok(json),
            None => Ok("null".into()),
        }
    }

    pub fn shape_metrics(&self, id: &str) -> Result<String, JsValue> {
        match self.inner.shape_metrics(id) {
            Some(metrics) => serde_json::to_string(&metrics)
                .map_err(|e| JsValue::from_str(&format!("serialize metrics: {e}"))),
            None => Ok("null".into()),
        }
    }

    pub fn find_neighbors(&self, id: &str, margin: f64) -> Result<String, JsValue> {
        let neighbors = self.inner.find_neighbors(id, margin);
        serde_json::to_string(&serde_json::json!({ "neighbors": neighbors }))
            .map_err(|e| JsValue::from_str(&format!("serialize neighbors: {e}")))
    }

    pub fn find_neighbors_for_shape_json(&self, shape_json: &str, margin: f64) -> Result<String, JsValue> {
        let shape: geom_core::Shape = serde_json::from_str(shape_json)
            .map_err(|e| JsValue::from_str(&format!("invalid shape JSON: {e}")))?;
        let neighbors = self.inner.find_neighbors_for_shape(&shape, margin);
        serde_json::to_string(&serde_json::json!({ "neighbors": neighbors }))
            .map_err(|e| JsValue::from_str(&format!("serialize neighbors: {e}")))
    }

    pub fn snap_point(&self, x: f64, y: f64) -> Result<String, JsValue> {
        let pt = self.inner.snap_point(x, y);
        serde_json::to_string(&pt).map_err(|e| JsValue::from_str(&format!("serialize point: {e}")))
    }

    pub fn create_route_json(&mut self, route_json: &str) -> Result<(), JsValue> {
        self.inner
            .create_route_json(route_json)
            .map_err(|e| JsValue::from_str(&e))
    }

    pub fn route_intersects(&self, route_id: &str) -> Result<String, JsValue> {
        let hits = self.inner.route_intersects(route_id);
        serde_json::to_string(&serde_json::json!({ "intersections": hits }))
            .map_err(|e| JsValue::from_str(&format!("serialize intersections: {e}")))
    }

    pub fn distance_between_shapes(&self, a_id: &str, b_id: &str) -> Result<String, JsValue> {
        match self.inner.distance_between_shapes(a_id, b_id) {
            Some(distance) => Ok(serde_json::json!({ "distance": distance }).to_string()),
            None => Ok("null".into()),
        }
    }
}

// Backward-compatible alias used by older bindings
#[wasm_bindgen]
pub struct SpatialScene {
    scene: Scene,
}

#[wasm_bindgen]
impl SpatialScene {
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self {
        SpatialScene {
            scene: Scene::new(20.0),
        }
    }

    pub fn rebuild_from_json(&mut self, elements_json: &str) -> Result<(), JsValue> {
        self.scene.import_shapes_from_json(elements_json)
    }

    pub fn query_overlapping(&self, new_shape_json: &str, margin: f64) -> Result<String, JsValue> {
        self.scene
            .find_neighbors_for_shape_json(new_shape_json, margin)
    }
}

#[wasm_bindgen(start)]
pub fn init() {}
