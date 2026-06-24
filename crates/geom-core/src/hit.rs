use crate::point::Point;
use crate::shape::Shape;

#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum HitKind {
    Body,
    Vertex,
    Edge,
}

#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
pub struct HitResult {
    pub shape_id: String,
    pub kind: HitKind,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub vertex_index: Option<usize>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub edge_index: Option<usize>,
    pub point: Point,
    pub distance: f64,
}

pub fn distance(ax: f64, ay: f64, bx: f64, by: f64) -> f64 {
    let dx = bx - ax;
    let dy = ay - by;
    (dx * dx + dy * dy).sqrt()
}

pub fn project_point_on_segment(px: f64, py: f64, ax: f64, ay: f64, bx: f64, by: f64) -> Point {
    let dx = bx - ax;
    let dy = by - ay;
    let len_sq = dx * dx + dy * dy;
    if len_sq == 0.0 {
        return Point::new(ax, ay);
    }
    let t = ((px - ax) * dx + (py - ay) * dy) / len_sq;
    let t = t.clamp(0.0, 1.0);
    Point::new(ax + t * dx, ay + t * dy)
}

pub fn point_in_polygon(x: f64, y: f64, points: &[Point]) -> bool {
    if points.len() < 3 {
        return false;
    }
    let mut inside = false;
    let mut j = points.len() - 1;
    for i in 0..points.len() {
        let xi = points[i].x;
        let yi = points[i].y;
        let xj = points[j].x;
        let yj = points[j].y;
        let intersect = ((yi > y) != (yj > y))
            && (x < (xj - xi) * (y - yi) / (yj - yi + f64::EPSILON) + xi);
        if intersect {
            inside = !inside;
        }
        j = i;
    }
    inside
}

pub fn point_in_ellipse(x: f64, y: f64, cx: f64, cy: f64, rx: f64, ry: f64) -> bool {
    if rx.abs() < f64::EPSILON || ry.abs() < f64::EPSILON {
        return false;
    }
    let dx = (x - cx) / rx;
    let dy = (y - cy) / ry;
    dx * dx + dy * dy <= 1.0
}

fn shape_contains_point(shape: &Shape, x: f64, y: f64) -> bool {
    match shape {
        Shape::Rectangle { x: rx, y: ry, width, height, .. } => {
            x >= *rx && x <= rx + width && y >= *ry && y <= ry + height
        }
        Shape::Circle { x: rx, y: ry, width, height, .. } => {
            let cx = rx + width / 2.0;
            let center_y = ry + height / 2.0;
            point_in_ellipse(x, y, cx, center_y, width.abs() / 2.0, height.abs() / 2.0)
        }
        Shape::Polygon { points, .. } => point_in_polygon(x, y, points),
    }
}

pub fn hit_test_vertex(points: &[Point], x: f64, y: f64, radius: f64) -> Option<usize> {
    for i in (0..points.len()).rev() {
        let pt = &points[i];
        if distance(x, y, pt.x, pt.y) <= radius {
            return Some(i);
        }
    }
    None
}

pub fn hit_test_edge(
    points: &[Point],
    x: f64,
    y: f64,
    radius: f64,
) -> Option<(usize, Point, f64)> {
    let mut best: Option<(usize, Point, f64)> = None;
    for i in 0..points.len() {
        let a = &points[i];
        let b = &points[(i + 1) % points.len()];
        let projected = project_point_on_segment(x, y, a.x, a.y, b.x, b.y);
        let dist = distance(x, y, projected.x, projected.y);
        if dist <= radius {
            if best.as_ref().map_or(true, |(_, _, d)| dist < *d) {
                best = Some((i, projected, dist));
            }
        }
    }
    best
}

pub fn hit_test_shapes(
    shapes: &[Shape],
    x: f64,
    y: f64,
    vertex_radius: f64,
    edit_shape_id: Option<&str>,
) -> Option<HitResult> {
    if let Some(edit_id) = edit_shape_id {
        if let Some(shape) = shapes.iter().find(|s| s.id() == edit_id) {
            if let Shape::Polygon { id, points, .. } = shape {
                if let Some(vertex_index) = hit_test_vertex(points, x, y, vertex_radius) {
                    let pt = points[vertex_index];
                    return Some(HitResult {
                        shape_id: id.clone(),
                        kind: HitKind::Vertex,
                        vertex_index: Some(vertex_index),
                        edge_index: None,
                        point: pt,
                        distance: distance(x, y, pt.x, pt.y),
                    });
                }
                if let Some((edge_index, point, dist)) = hit_test_edge(points, x, y, vertex_radius) {
                    return Some(HitResult {
                        shape_id: id.clone(),
                        kind: HitKind::Edge,
                        vertex_index: None,
                        edge_index: Some(edge_index),
                        point,
                        distance: dist,
                    });
                }
            }
        }
    }

    for shape in shapes.iter().rev() {
        let aabb = shape.aabb();
        if !aabb.contains_point(x, y) {
            continue;
        }
        if shape_contains_point(shape, x, y) {
            return Some(HitResult {
                shape_id: shape.id().to_string(),
                kind: HitKind::Body,
                vertex_index: None,
                edge_index: None,
                point: Point::new(x, y),
                distance: 0.0,
            });
        }
    }
    None
}

pub fn nearest_shape(shapes: &[Shape], x: f64, y: f64) -> Option<(String, f64)> {
    let mut best: Option<(String, f64)> = None;
    for shape in shapes {
        let aabb = shape.aabb();
        let cx = (aabb.min_x + aabb.max_x) / 2.0;
        let cy = (aabb.min_y + aabb.max_y) / 2.0;
        let dist = distance(x, y, cx, cy);
        if best.as_ref().map_or(true, |(_, d)| dist < *d) {
            best = Some((shape.id().to_string(), dist));
        }
    }
    best
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::shape::Shape;

    #[test]
    fn point_in_square_polygon() {
        let pts = vec![
            Point::new(0.0, 0.0),
            Point::new(10.0, 0.0),
            Point::new(10.0, 10.0),
            Point::new(0.0, 10.0),
        ];
        assert!(point_in_polygon(5.0, 5.0, &pts));
        assert!(!point_in_polygon(15.0, 5.0, &pts));
    }

    #[test]
    fn hit_test_finds_topmost() {
        let shapes = vec![
            Shape::Rectangle {
                id: "bottom".into(),
                x: 0.0,
                y: 0.0,
                width: 20.0,
                height: 20.0,
                fill: String::new(),
                stroke: String::new(),
                stroke_width: 0.0,
                label: None,
            },
            Shape::Rectangle {
                id: "top".into(),
                x: 5.0,
                y: 5.0,
                width: 10.0,
                height: 10.0,
                fill: String::new(),
                stroke: String::new(),
                stroke_width: 0.0,
                label: None,
            },
        ];
        let hit = hit_test_shapes(&shapes, 8.0, 8.0, 1.0, None).unwrap();
        assert_eq!(hit.shape_id, "top");
    }
}
