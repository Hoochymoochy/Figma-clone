#[derive(Debug, Clone, Copy, PartialEq)]
pub struct SnappedPosition {
    pub original_x: f64,
    pub original_y: f64,
    pub snapped_x: f64,
    pub snapped_y: f64,
}

pub fn snap_to_grid(x: f64, y: f64, grid_size: f64) -> SnappedPosition {
    let snapped_x = (x / grid_size).round() * grid_size;
    let snapped_y = (y / grid_size).round() * grid_size;
    SnappedPosition {
        original_x: x,
        original_y: y,
        snapped_x,
        snapped_y,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn snaps_to_grid() {
        let s = snap_to_grid(23.0, 37.0, 20.0);
        assert_eq!(s.snapped_x, 20.0);
        assert_eq!(s.snapped_y, 40.0);
    }
}
