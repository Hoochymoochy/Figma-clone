use crate::hit::{hit_test_shapes, nearest_shape, HitResult};
use crate::layer::Layer;
use crate::measure::{measure_points, shape_metrics, distance_between_shapes, MeasureResult, ShapeMetrics};
use crate::point::Point;
use crate::route::{route_aabb, route_intersects_shapes, validate_orthogonal, Route, RouteError};
use crate::shape::Shape;
use crate::snap::snap_to_grid;
use crate::spatial::{query_neighbors, QueryMode, SpatialIndex};

const DEFAULT_GRID_SIZE: f64 = 20.0;

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct SceneExport {
    pub version: u32,
    pub shapes: Vec<Shape>,
    pub routes: Vec<Route>,
    pub layers: Vec<Layer>,
}

#[derive(Debug)]
pub struct Scene {
    shapes: Vec<Shape>,
    routes: Vec<Route>,
    layers: Vec<Layer>,
    index: SpatialIndex,
    grid_size: f64,
}

impl Default for Scene {
    fn default() -> Self {
        Self::new(DEFAULT_GRID_SIZE)
    }
}

impl Scene {
    pub fn new(grid_size: f64) -> Self {
        Self {
            shapes: Vec::new(),
            routes: Vec::new(),
            layers: vec![Layer::default_layer()],
            index: SpatialIndex::new(SpatialIndex::default_cell_size()),
            grid_size,
        }
    }

    pub fn grid_size(&self) -> f64 {
        self.grid_size
    }

    pub fn import_from_json(&mut self, json: &str) -> Result<(), String> {
        let export: SceneExport = serde_json::from_str(json).map_err(|e| e.to_string())?;
        self.shapes = export.shapes;
        self.routes = export.routes;
        self.layers = if export.layers.is_empty() {
            vec![Layer::default_layer()]
        } else {
            export.layers
        };
        self.rebuild_index();
        Ok(())
    }

    pub fn import_shapes_from_json(&mut self, json: &str) -> Result<(), String> {
        self.shapes = serde_json::from_str(json).map_err(|e| e.to_string())?;
        self.rebuild_index();
        Ok(())
    }

    pub fn export_to_json(&self) -> Result<String, String> {
        let export = SceneExport {
            version: 1,
            shapes: self.shapes.clone(),
            routes: self.routes.clone(),
            layers: self.layers.clone(),
        };
        serde_json::to_string(&export).map_err(|e| e.to_string())
    }

    pub fn export_shapes_json(&self) -> Result<String, String> {
        serde_json::to_string(&self.shapes).map_err(|e| e.to_string())
    }

    pub fn export_routes_json(&self) -> Result<String, String> {
        serde_json::to_string(&self.routes).map_err(|e| e.to_string())
    }

    pub fn add_shape(&mut self, shape: Shape) {
        self.shapes.push(shape);
        self.rebuild_index();
    }

    pub fn add_shape_json(&mut self, json: &str) -> Result<(), String> {
        let shape: Shape = serde_json::from_str(json).map_err(|e| e.to_string())?;
        self.add_shape(shape);
        Ok(())
    }

    pub fn remove_shape(&mut self, id: &str) -> bool {
        let before = self.shapes.len();
        self.shapes.retain(|s| s.id() != id);
        if self.shapes.len() != before {
            self.rebuild_index();
            true
        } else {
            false
        }
    }

    pub fn remove_shapes(&mut self, ids: &[String]) {
        self.shapes.retain(|s| !ids.contains(&s.id().to_string()));
        self.rebuild_index();
    }

    pub fn update_shape(&mut self, id: &str, patch_json: &str) -> Result<(), String> {
        let idx = self
            .shapes
            .iter()
            .position(|s| s.id() == id)
            .ok_or_else(|| format!("shape not found: {id}"))?;
        let mut value = serde_json::to_value(&self.shapes[idx]).map_err(|e| e.to_string())?;
        let patch: serde_json::Value = serde_json::from_str(patch_json).map_err(|e| e.to_string())?;
        merge_json(&mut value, patch);
        self.shapes[idx] = serde_json::from_value(value).map_err(|e| e.to_string())?;
        self.rebuild_index();
        Ok(())
    }

    pub fn get_shape(&self, id: &str) -> Option<&Shape> {
        self.shapes.iter().find(|s| s.id() == id)
    }

    pub fn hit_test(
        &self,
        x: f64,
        y: f64,
        vertex_radius: f64,
        edit_shape_id: Option<&str>,
    ) -> Option<HitResult> {
        hit_test_shapes(&self.shapes, x, y, vertex_radius, edit_shape_id)
    }

    pub fn nearest_shape(&self, x: f64, y: f64) -> Option<(String, f64)> {
        nearest_shape(&self.shapes, x, y)
    }

    pub fn measure_distance(&self, x1: f64, y1: f64, x2: f64, y2: f64) -> MeasureResult {
        measure_points(
            Point::new(x1, y1),
            Point::new(x2, y2),
            self.grid_size,
        )
    }

    pub fn shape_metrics(&self, id: &str) -> Option<ShapeMetrics> {
        self.get_shape(id).map(shape_metrics)
    }

    pub fn shape_bounds_json(&self, id: &str) -> Option<String> {
        self.get_shape(id).map(|s| {
            let m = shape_metrics(s);
            serde_json::json!({
                "left": m.min_x,
                "top": m.min_y,
                "right": m.max_x,
                "bottom": m.max_y,
            })
            .to_string()
        })
    }

    pub fn find_neighbors(&self, id: &str, margin: f64) -> Vec<String> {
        let Some(shape) = self.get_shape(id) else {
            return Vec::new();
        };
        self.find_neighbors_for_shape(shape, margin)
    }

    pub fn find_neighbors_for_shape(&self, shape: &Shape, margin: f64) -> Vec<String> {
        query_neighbors(&self.shapes, shape, margin, QueryMode::Nearby).neighbors
    }

    pub fn snap_point(&self, x: f64, y: f64) -> Point {
        let snapped = snap_to_grid(x, y, self.grid_size);
        Point::new(snapped.snapped_x, snapped.snapped_y)
    }

    pub fn create_route(&mut self, route: Route) -> Result<(), RouteError> {
        validate_orthogonal(&route.segments)?;
        self.routes.push(route);
        Ok(())
    }

    pub fn create_route_json(&mut self, json: &str) -> Result<(), String> {
        let route: Route = serde_json::from_str(json).map_err(|e| e.to_string())?;
        self.create_route(route).map_err(|e| e.to_string())
    }

    pub fn route_intersects(&self, route_id: &str) -> Vec<String> {
        let Some(route) = self.routes.iter().find(|r| r.id == route_id) else {
            return Vec::new();
        };
        route_intersects_shapes(route, &self.shapes)
    }

    pub fn route_bounds_json(&self, route_id: &str) -> Option<String> {
        let route = self.routes.iter().find(|r| r.id == route_id)?;
        route_aabb(route).map(|b| {
            serde_json::json!({
                "left": b.min_x,
                "top": b.min_y,
                "right": b.max_x,
                "bottom": b.max_y,
            })
            .to_string()
        })
    }

    pub fn distance_between_shapes(&self, a_id: &str, b_id: &str) -> Option<f64> {
        let a = self.get_shape(a_id)?;
        let b = self.get_shape(b_id)?;
        Some(distance_between_shapes(a, b))
    }

    fn rebuild_index(&mut self) {
        self.index.clear();
        for (i, shape) in self.shapes.iter().enumerate() {
            self.index.insert(i, &shape.aabb());
        }
    }
}

fn merge_json(base: &mut serde_json::Value, patch: serde_json::Value) {
    match (base, patch) {
        (serde_json::Value::Object(base_map), serde_json::Value::Object(patch_map)) => {
            for (k, v) in patch_map {
                if v.is_null() {
                    base_map.remove(&k);
                } else {
                    merge_json(base_map.entry(k).or_insert(serde_json::Value::Null), v);
                }
            }
        }
        (base_slot, patch_val) => {
            *base_slot = patch_val;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::route::RouteSegment;

    fn rect(id: &str, x: f64, y: f64, w: f64, h: f64) -> Shape {
        Shape::Rectangle {
            id: id.into(),
            x,
            y,
            width: w,
            height: h,
            fill: String::new(),
            stroke: String::new(),
            stroke_width: 0.0,
            label: None,
        }
    }

    #[test]
    fn add_and_export_shapes() {
        let mut scene = Scene::new(20.0);
        scene.add_shape(rect("a", 0.0, 0.0, 10.0, 10.0));
        let json = scene.export_shapes_json().unwrap();
        assert!(json.contains("\"a\""));
    }

    #[test]
    fn update_shape_patch() {
        let mut scene = Scene::new(20.0);
        scene.add_shape(rect("a", 0.0, 0.0, 10.0, 10.0));
        scene
            .update_shape("a", r#"{"x": 5.0}"#)
            .unwrap();
        let shape = scene.get_shape("a").unwrap();
        match shape {
            Shape::Rectangle { x, .. } => assert_eq!(*x, 5.0),
            _ => panic!("expected rectangle"),
        }
    }

    #[test]
    fn create_orthogonal_route() {
        let mut scene = Scene::new(20.0);
        scene.add_shape(rect("block", 40.0, 0.0, 10.0, 10.0));
        let route = Route {
            id: "r1".into(),
            segments: vec![
                RouteSegment {
                    from: Point::new(0.0, 0.0),
                    to: Point::new(50.0, 0.0),
                },
                RouteSegment {
                    from: Point::new(50.0, 0.0),
                    to: Point::new(50.0, 20.0),
                },
            ],
            width: 2.0,
            layer_id: "default".into(),
            stroke: "#FFB43C".into(),
        };
        scene.create_route(route).unwrap();
        let hits = scene.route_intersects("r1");
        assert!(hits.contains(&"block".to_string()));
    }
}
