use crate::aabb::Aabb;
use crate::point::Point;
use crate::shape::Shape;

#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
pub struct RouteSegment {
    pub from: Point,
    pub to: Point,
}

#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
pub struct Route {
    pub id: String,
    pub segments: Vec<RouteSegment>,
    #[serde(default = "default_route_width")]
    pub width: f64,
    #[serde(default = "default_layer_id")]
    pub layer_id: String,
    #[serde(default = "default_route_stroke")]
    pub stroke: String,
}

fn default_route_width() -> f64 {
    2.0
}

fn default_layer_id() -> String {
    "default".into()
}

fn default_route_stroke() -> String {
    "#FFB43C".into()
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum RouteError {
    NotOrthogonal,
    Empty,
}

impl std::fmt::Display for RouteError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            RouteError::NotOrthogonal => write!(f, "route segments must be orthogonal"),
            RouteError::Empty => write!(f, "route must have at least one segment"),
        }
    }
}

pub fn validate_orthogonal(segments: &[RouteSegment]) -> Result<(), RouteError> {
    if segments.is_empty() {
        return Err(RouteError::Empty);
    }
    for seg in segments {
        let dx = (seg.to.x - seg.from.x).abs();
        let dy = (seg.to.y - seg.from.y).abs();
        if dx > f64::EPSILON && dy > f64::EPSILON {
            return Err(RouteError::NotOrthogonal);
        }
    }
    Ok(())
}

pub fn route_aabb(route: &Route) -> Option<Aabb> {
    if route.segments.is_empty() {
        return None;
    }
    let half = route.width / 2.0;
    let mut min_x = f64::INFINITY;
    let mut min_y = f64::INFINITY;
    let mut max_x = f64::NEG_INFINITY;
    let mut max_y = f64::NEG_INFINITY;
    for seg in &route.segments {
        for pt in [&seg.from, &seg.to] {
            min_x = min_x.min(pt.x - half);
            min_y = min_y.min(pt.y - half);
            max_x = max_x.max(pt.x + half);
            max_y = max_y.max(pt.y + half);
        }
    }
    Some(Aabb::new(min_x, min_y, max_x, max_y))
}

pub fn route_intersects_shapes(route: &Route, shapes: &[Shape]) -> Vec<String> {
    let Some(route_bounds) = route_aabb(route) else {
        return Vec::new();
    };
    let mut hits = Vec::new();
    for shape in shapes {
        if route_bounds.intersects(&shape.aabb()) {
            hits.push(shape.id().to_string());
        }
    }
    hits
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_diagonal_segment() {
        let segments = vec![RouteSegment {
            from: Point::new(0.0, 0.0),
            to: Point::new(10.0, 10.0),
        }];
        assert!(validate_orthogonal(&segments).is_err());
    }

    #[test]
    fn accepts_orthogonal_segment() {
        let segments = vec![RouteSegment {
            from: Point::new(0.0, 0.0),
            to: Point::new(10.0, 0.0),
        }];
        assert!(validate_orthogonal(&segments).is_ok());
    }
}
