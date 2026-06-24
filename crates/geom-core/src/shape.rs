use crate::aabb::Aabb;
use crate::point::Point;

#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
#[serde(tag = "type")]
pub enum Shape {
    #[serde(rename = "rectangle")]
    Rectangle {
        id: String,
        x: f64,
        y: f64,
        width: f64,
        height: f64,
        #[serde(default)]
        fill: String,
        #[serde(default)]
        stroke: String,
        #[serde(default, rename = "strokeWidth")]
        stroke_width: f64,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        label: Option<String>,
    },
    #[serde(rename = "circle")]
    Circle {
        id: String,
        x: f64,
        y: f64,
        width: f64,
        height: f64,
        #[serde(default)]
        fill: String,
        #[serde(default)]
        stroke: String,
        #[serde(default, rename = "strokeWidth")]
        stroke_width: f64,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        label: Option<String>,
    },
    #[serde(rename = "polygon")]
    Polygon {
        id: String,
        points: Vec<Point>,
        #[serde(default)]
        fill: String,
        #[serde(default)]
        stroke: String,
        #[serde(default, rename = "strokeWidth")]
        stroke_width: f64,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        label: Option<String>,
    },
}

impl Shape {
    pub fn id(&self) -> &str {
        match self {
            Shape::Rectangle { id, .. } | Shape::Circle { id, .. } | Shape::Polygon { id, .. } => id,
        }
    }

    pub fn aabb(&self) -> Aabb {
        match self {
            Shape::Rectangle { x, y, width, height, .. }
            | Shape::Circle { x, y, width, height, .. } => Aabb::new(*x, *y, x + width, y + height),
            Shape::Polygon { points, .. } => Aabb::from_points(points).unwrap_or(Aabb::new(0.0, 0.0, 0.0, 0.0)),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn polygon_aabb_matches_bounds() {
        let shape = Shape::Polygon {
            id: "p1".into(),
            points: vec![
                Point::new(10.0, 5.0),
                Point::new(30.0, 20.0),
                Point::new(5.0, 25.0),
            ],
            fill: String::new(),
            stroke: String::new(),
            stroke_width: 0.0,
            label: None,
        };
        let b = shape.aabb();
        assert_eq!(b.min_x, 5.0);
        assert_eq!(b.min_y, 5.0);
        assert_eq!(b.max_x, 30.0);
        assert_eq!(b.max_y, 25.0);
    }
}
