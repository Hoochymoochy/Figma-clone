use std::collections::HashMap;

use crate::aabb::Aabb;
use crate::shape::Shape;

const DEFAULT_CELL_SIZE: f64 = 64.0;

#[derive(Debug, Clone)]
pub struct SpatialIndex {
    cell_size: f64,
    cells: HashMap<(i64, i64), Vec<usize>>,
}

impl SpatialIndex {
    pub fn new(cell_size: f64) -> Self {
        Self {
            cell_size,
            cells: HashMap::new(),
        }
    }

    pub fn default_cell_size() -> f64 {
        DEFAULT_CELL_SIZE
    }

    pub fn clear(&mut self) {
        self.cells.clear();
    }

    pub fn insert(&mut self, shape_index: usize, aabb: &Aabb) {
        for cell in cells_for_aabb(aabb, self.cell_size) {
            self.cells.entry(cell).or_default().push(shape_index);
        }
    }

    pub fn query_aabb(&self, query: &Aabb) -> Vec<usize> {
        let mut seen = Vec::new();
        for cell in cells_for_aabb(query, self.cell_size) {
            if let Some(indices) = self.cells.get(&cell) {
                for &idx in indices {
                    if !seen.contains(&idx) {
                        seen.push(idx);
                    }
                }
            }
        }
        seen
    }
}

fn cells_for_aabb(aabb: &Aabb, cell_size: f64) -> Vec<(i64, i64)> {
    let min_cx = (aabb.min_x / cell_size).floor() as i64;
    let min_cy = (aabb.min_y / cell_size).floor() as i64;
    let max_cx = (aabb.max_x / cell_size).floor() as i64;
    let max_cy = (aabb.max_y / cell_size).floor() as i64;

    let mut cells = Vec::new();
    for cx in min_cx..=max_cx {
        for cy in min_cy..=max_cy {
            cells.push((cx, cy));
        }
    }
    cells
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum QueryMode {
    Overlap,
    Nearby,
    Contains,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct QueryResult {
    pub neighbors: Vec<String>,
}

pub fn query_neighbors(
    shapes: &[Shape],
    new_shape: &Shape,
    margin: f64,
    mode: QueryMode,
) -> QueryResult {
    let index = build_index(shapes);
    let query_aabb = match mode {
        QueryMode::Overlap => new_shape.aabb(),
        QueryMode::Nearby => new_shape.aabb().expand(margin),
        QueryMode::Contains => new_shape.aabb(),
    };

    let candidates = index.query_aabb(&query_aabb);
    let new_id = new_shape.id();
    let mut neighbors = Vec::new();

    for idx in candidates {
        let existing = &shapes[idx];
        if existing.id() == new_id {
            continue;
        }
        let existing_aabb = existing.aabb();
        let matches = match mode {
            QueryMode::Overlap => new_shape.aabb().intersects(&existing_aabb),
            QueryMode::Nearby => new_shape.aabb().expand(margin).intersects(&existing_aabb),
            QueryMode::Contains => {
                let inner = new_shape.aabb();
                inner.min_x >= existing_aabb.min_x
                    && inner.min_y >= existing_aabb.min_y
                    && inner.max_x <= existing_aabb.max_x
                    && inner.max_y <= existing_aabb.max_y
            }
        };
        if matches {
            neighbors.push(existing.id().to_string());
        }
    }

    QueryResult { neighbors }
}

pub fn query_neighbors_brute_force(
    shapes: &[Shape],
    new_shape: &Shape,
    margin: f64,
) -> QueryResult {
    query_neighbors(shapes, new_shape, margin, QueryMode::Nearby)
}

fn build_index(shapes: &[Shape]) -> SpatialIndex {
    let mut index = SpatialIndex::new(SpatialIndex::default_cell_size());
    for (i, shape) in shapes.iter().enumerate() {
        index.insert(i, &shape.aabb());
    }
    index
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::point::Point;

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
    fn finds_overlapping_neighbor() {
        let shapes = vec![rect("a", 0.0, 0.0, 10.0, 10.0), rect("b", 20.0, 0.0, 10.0, 10.0)];
        let new_shape = rect("c", 8.0, 0.0, 10.0, 10.0);
        let result = query_neighbors(&shapes, &new_shape, 0.0, QueryMode::Overlap);
        assert_eq!(result.neighbors, vec!["a".to_string()]);
    }

    #[test]
    fn nearby_includes_touching_within_margin() {
        let shapes = vec![rect("a", 0.0, 0.0, 10.0, 10.0), rect("b", 40.0, 0.0, 10.0, 10.0)];
        let new_shape = rect("c", 12.0, 0.0, 10.0, 10.0);
        let result = query_neighbors(&shapes, &new_shape, 5.0, QueryMode::Nearby);
        assert!(result.neighbors.contains(&"a".to_string()));
        assert!(!result.neighbors.contains(&"b".to_string()));
    }

    #[test]
    fn index_matches_brute_force() {
        let shapes = vec![
            rect("a", 0.0, 0.0, 10.0, 10.0),
            rect("b", 50.0, 50.0, 10.0, 10.0),
            Shape::Polygon {
                id: "c".into(),
                points: vec![Point::new(100.0, 0.0), Point::new(120.0, 20.0), Point::new(90.0, 25.0)],
                fill: String::new(),
                stroke: String::new(),
                stroke_width: 0.0,
                label: None,
            },
        ];
        let new_shape = rect("d", 95.0, 0.0, 10.0, 10.0);
        let indexed = query_neighbors(&shapes, &new_shape, 8.0, QueryMode::Nearby);
        let brute = query_neighbors_brute_force(&shapes, &new_shape, 8.0);
        assert_eq!(indexed.neighbors, brute.neighbors);
    }
}
