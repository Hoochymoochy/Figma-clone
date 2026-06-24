use crate::point::Point;
use crate::shape::Shape;

#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
pub struct MeasureResult {
    pub distance: f64,
    pub dx: f64,
    pub dy: f64,
    pub grid_dx: f64,
    pub grid_dy: f64,
    pub grid_distance: f64,
}

#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
pub struct ShapeMetrics {
    pub width: f64,
    pub height: f64,
    pub area: f64,
    pub min_x: f64,
    pub min_y: f64,
    pub max_x: f64,
    pub max_y: f64,
}

pub fn measure_points(a: Point, b: Point, grid_size: f64) -> MeasureResult {
    let dx = b.x - a.x;
    let dy = b.y - a.y;
    let distance = (dx * dx + dy * dy).sqrt();
    let grid_dx = dx / grid_size;
    let grid_dy = dy / grid_size;
    let grid_distance = (grid_dx * grid_dx + grid_dy * grid_dy).sqrt();
    MeasureResult {
        distance,
        dx,
        dy,
        grid_dx,
        grid_dy,
        grid_distance,
    }
}

pub fn shape_metrics(shape: &Shape) -> ShapeMetrics {
    let aabb = shape.aabb();
    let width = aabb.width();
    let height = aabb.height();
    let area = match shape {
        Shape::Rectangle { width, height, .. } => width * height,
        Shape::Circle { width, height, .. } => {
            std::f64::consts::PI * (width.abs() / 2.0) * (height.abs() / 2.0)
        }
        Shape::Polygon { points, .. } => polygon_area(points),
    };
    ShapeMetrics {
        width,
        height,
        area,
        min_x: aabb.min_x,
        min_y: aabb.min_y,
        max_x: aabb.max_x,
        max_y: aabb.max_y,
    }
}

pub fn distance_between_shapes(a: &Shape, b: &Shape) -> f64 {
    let aa = a.aabb();
    let bb = b.aabb();
    let dx = (aa.min_x - bb.max_x).max(bb.min_x - aa.max_x).max(0.0);
    let dy = (aa.min_y - bb.max_y).max(bb.min_y - aa.max_y).max(0.0);
    (dx * dx + dy * dy).sqrt()
}

fn polygon_area(points: &[Point]) -> f64 {
    if points.len() < 3 {
        return 0.0;
    }
    let mut area = 0.0;
    for i in 0..points.len() {
        let j = (i + 1) % points.len();
        area += points[i].x * points[j].y;
        area -= points[j].x * points[i].y;
    }
    area.abs() / 2.0
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::shape::Shape;

    #[test]
    fn grid_distance_matches_grid_units() {
        let result = measure_points(Point::new(0.0, 0.0), Point::new(40.0, 20.0), 20.0);
        assert_eq!(result.grid_dx, 2.0);
        assert_eq!(result.grid_dy, 1.0);
        assert!((result.grid_distance - 5.0_f64.sqrt()).abs() < 1e-9);
    }

    #[test]
    fn rectangle_area() {
        let shape = Shape::Rectangle {
            id: "r".into(),
            x: 0.0,
            y: 0.0,
            width: 10.0,
            height: 5.0,
            fill: String::new(),
            stroke: String::new(),
            stroke_width: 0.0,
            label: None,
        };
        assert_eq!(shape_metrics(&shape).area, 50.0);
    }
}
