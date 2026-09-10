#[derive(Debug, serde::Serialize, serde::Deserialize, Clone, specta::Type)]
#[serde(default)]
pub struct AppState {
    pub current_device: scrybe_core::devices::AudioDevice,
    pub audio_format: scrybe_core::devices::AudioFormat,
    pub model_path: String,
    pub audio_segment_size: u64,
    pub sidebar_open: bool,
    pub overlay_config: OverlayConfig,
    pub home_right_rail: HomeRightRailSettings,
    pub whisper_params: scrybe_core::whisper::WhisperParams,
    pub advanced_settings: AdvancedSettings,
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            current_device: scrybe_core::devices::AudioDevice::default(),
            audio_format: scrybe_core::devices::AudioFormat::default(),
            model_path: Default::default(),
            audio_segment_size: 15,
            sidebar_open: true,
            overlay_config: OverlayConfig::default(),
            home_right_rail: HomeRightRailSettings::default(),
            whisper_params: scrybe_core::whisper::WhisperParams::default(),
            advanced_settings: AdvancedSettings::default(),
        }
    }
}

const OVERLAY_DEFAULT_CANVAS_WIDTH: i32 = 1920;
const OVERLAY_DEFAULT_CANVAS_HEIGHT: i32 = 1080;
const OVERLAY_MIN_BOX_WIDTH: i32 = 200;
const OVERLAY_MIN_BOX_HEIGHT: i32 = 60;
const OVERLAY_DEFAULT_BOX_HEIGHT: i32 = 140;

#[derive(Debug, serde::Serialize, serde::Deserialize, Clone, PartialEq, specta::Type)]
#[serde(default)]
pub struct OverlayCanvas {
    pub width: i32,
    pub height: i32,
}

impl Default for OverlayCanvas {
    fn default() -> Self {
        Self {
            width: OVERLAY_DEFAULT_CANVAS_WIDTH,
            height: OVERLAY_DEFAULT_CANVAS_HEIGHT,
        }
    }
}

impl OverlayCanvas {
    fn normalized(self) -> Self {
        Self {
            width: self.width.max(OVERLAY_MIN_BOX_WIDTH),
            height: self.height.max(OVERLAY_MIN_BOX_HEIGHT),
        }
    }
}

#[derive(Debug, serde::Serialize, serde::Deserialize, Clone, PartialEq, specta::Type)]
#[serde(default)]
pub struct OverlayBox {
    pub x: i32,
    pub y: i32,
    pub w: i32,
    pub h: i32,
}

impl Default for OverlayBox {
    fn default() -> Self {
        Self::bottom_middle(&OverlayCanvas::default())
    }
}

impl OverlayBox {
    fn bottom_middle(canvas: &OverlayCanvas) -> Self {
        let w = ((canvas.width as f64) * 0.6).round() as i32;
        let h = OVERLAY_DEFAULT_BOX_HEIGHT;
        let margin = (canvas.width.min(canvas.height) as f64) * 0.04;
        Self {
            x: ((canvas.width - w) as f64 / 2.0).round() as i32,
            y: ((canvas.height - h) as f64 - margin).round() as i32,
            w,
            h,
        }
        .clamp_to(canvas)
    }

    fn clamp_to(self, canvas: &OverlayCanvas) -> Self {
        let w = self.w.max(OVERLAY_MIN_BOX_WIDTH).min(canvas.width);
        let h = self.h.max(OVERLAY_MIN_BOX_HEIGHT).min(canvas.height);

        Self {
            x: self.x.max(0).min(canvas.width - w),
            y: self.y.max(0).min(canvas.height - h),
            w,
            h,
        }
    }
}

#[derive(
    Debug, Default, serde::Serialize, serde::Deserialize, Clone, Copy, PartialEq, Eq, specta::Type,
)]
#[serde(rename_all = "snake_case")]
pub enum OverlayAnchor {
    TopLeft,
    TopCenter,
    TopRight,
    MiddleLeft,
    MiddleCenter,
    MiddleRight,
    BottomLeft,
    #[default]
    BottomCenter,
    BottomRight,
}

impl OverlayAnchor {
    pub const ALL: [Self; 9] = [
        Self::TopLeft,
        Self::TopCenter,
        Self::TopRight,
        Self::MiddleLeft,
        Self::MiddleCenter,
        Self::MiddleRight,
        Self::BottomLeft,
        Self::BottomCenter,
        Self::BottomRight,
    ];

    pub fn factors(self) -> (f64, f64) {
        let index = Self::ALL.iter().position(|anchor| *anchor == self).unwrap();
        ((index % 3) as f64 / 2.0, (index / 3) as f64 / 2.0)
    }
}

#[derive(Debug, serde::Serialize, serde::Deserialize, Clone, PartialEq, specta::Type)]
#[serde(default)]
pub struct OverlayLayout {
    pub anchor: OverlayAnchor,
    pub x: i32,
    pub y: i32,
    pub max_width: i32,
}

impl Default for OverlayLayout {
    fn default() -> Self {
        Self::from_box(OverlayBox::default(), &OverlayCanvas::default())
    }
}

impl OverlayLayout {
    fn normalized(mut self, canvas: &OverlayCanvas) -> Self {
        self.max_width = self.max_width.clamp(OVERLAY_MIN_BOX_WIDTH, canvas.width);
        let (horizontal, _) = self.anchor.factors();
        let left = (self.max_width as f64 * horizontal).round() as i32;
        let right = canvas.width - self.max_width + left;
        self.x = self.x.clamp(left, right);
        self.y = self.y.clamp(0, canvas.height);
        self
    }

    fn from_box(old: OverlayBox, canvas: &OverlayCanvas) -> Self {
        let old = old.clamp_to(canvas);
        let margin = (canvas.width.min(canvas.height) as f64 * 0.04).round() as i32;
        let anchor = OverlayAnchor::ALL
            .into_iter()
            .min_by_key(|anchor| {
                let (hx, vy) = anchor.factors();
                let snap = |extent: i32, size: i32, factor: f64| {
                    let point = if factor == 0.0 {
                        margin
                    } else if factor == 1.0 {
                        extent - size - margin
                    } else {
                        ((extent - size) as f64 / 2.0).round() as i32
                    };
                    point.clamp(0, extent - size)
                };
                (snap(canvas.width, old.w, hx) - old.x).abs()
                    + (snap(canvas.height, old.h, vy) - old.y).abs()
            })
            .unwrap();
        let (hx, vy) = anchor.factors();
        Self {
            anchor,
            x: old.x + (old.w as f64 * hx).round() as i32,
            y: old.y + (old.h as f64 * vy).round() as i32,
            max_width: old.w,
        }
        .normalized(canvas)
    }
}

#[derive(Debug, serde::Serialize, Clone, PartialEq, Eq, specta::Type)]
#[serde(rename_all = "snake_case")]
pub enum OverlayPadding {
    None,
    Normal,
    Large,
}

impl Default for OverlayPadding {
    fn default() -> Self {
        Self::Normal
    }
}

impl<'de> serde::Deserialize<'de> for OverlayPadding {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        let value = <String as serde::Deserialize>::deserialize(deserializer)?;
        Ok(match value.as_str() {
            "none" | "tight" => Self::None,
            "large" | "wide" => Self::Large,
            _ => Self::Normal,
        })
    }
}

#[derive(Debug, serde::Serialize, serde::Deserialize, Clone, PartialEq, specta::Type)]
#[serde(default)]
pub struct OverlayStyle {
    pub align: String,
    pub font_size: i32,
    pub text_color: String,
    pub stroke_color: String,
    pub stroke_width: i32,
    pub background_color: String,
    pub background_opacity: i32,
    pub border_radius: i32,
    pub padding: OverlayPadding,
}

impl Default for OverlayStyle {
    fn default() -> Self {
        Self {
            align: "center".to_string(),
            font_size: 32,
            text_color: "#ffffff".to_string(),
            stroke_color: "#000000".to_string(),
            stroke_width: 0,
            background_color: "#000000".to_string(),
            background_opacity: 55,
            border_radius: 12,
            padding: OverlayPadding::Normal,
        }
    }
}

impl OverlayStyle {
    fn normalized(self) -> Self {
        Self {
            align: match self.align.as_str() {
                "left" | "center" | "right" => self.align,
                _ => "center".to_string(),
            },
            font_size: self.font_size.clamp(16, 96),
            text_color: normalize_hex_color(&self.text_color, "#ffffff"),
            stroke_color: normalize_hex_color(&self.stroke_color, "#000000"),
            stroke_width: self.stroke_width.clamp(0, 12),
            background_color: normalize_hex_color(&self.background_color, "#000000"),
            background_opacity: self.background_opacity.clamp(0, 100),
            border_radius: self.border_radius.clamp(0, 64),
            padding: self.padding,
        }
    }
}

#[derive(Debug, serde::Serialize, Clone, PartialEq, specta::Type)]
pub struct OverlayConfig {
    pub canvas: OverlayCanvas,
    pub layout: OverlayLayout,
    pub style: OverlayStyle,
}

impl Default for OverlayConfig {
    fn default() -> Self {
        let canvas = OverlayCanvas::default();
        Self {
            layout: OverlayLayout::default(),
            canvas,
            style: OverlayStyle::default(),
        }
    }
}

impl<'de> serde::Deserialize<'de> for OverlayConfig {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        let wire = OverlayConfigWire::deserialize(deserializer)?;
        Ok(OverlayConfig::from_wire(wire))
    }
}

impl OverlayConfig {
    fn from_wire(wire: OverlayConfigWire) -> Self {
        let mut config = OverlayConfig::default();
        let has_v2_canvas = wire.canvas.is_some();
        let has_v2_style = wire.style.is_some();

        if let Some(canvas) = wire.canvas {
            config.canvas = canvas.normalized();
        }
        if let Some(style) = wire.style {
            config.style = style.normalized();
        }
        if !has_v2_style {
            config.style = config.style.with_legacy(wire.legacy);
        }

        let legacy_box = wire
            .r#box
            .unwrap_or_else(|| {
                if has_v2_canvas {
                    OverlayBox::bottom_middle(&config.canvas)
                } else {
                    OverlayBox::default()
                }
            })
            .clamp_to(&config.canvas);
        config.layout = wire
            .layout
            .unwrap_or_else(|| OverlayLayout::from_box(legacy_box, &config.canvas))
            .normalized(&config.canvas);
        config
    }
}

#[derive(Default, serde::Deserialize)]
#[serde(default)]
struct OverlayConfigWire {
    layout: Option<OverlayLayout>,
    canvas: Option<OverlayCanvas>,
    #[serde(rename = "box")]
    r#box: Option<OverlayBox>,
    style: Option<OverlayStyle>,
    #[serde(flatten)]
    legacy: LegacyOverlayConfig,
}

#[derive(Default, serde::Deserialize)]
#[serde(default)]
struct LegacyOverlayConfig {
    text_alignment: Option<String>,
    background_color: Option<String>,
    transparency: Option<i32>,
    font_size: Option<i32>,
    corner_radius: Option<i32>,
    padding_x: Option<i32>,
}

impl OverlayStyle {
    fn with_legacy(mut self, legacy: LegacyOverlayConfig) -> Self {
        if let Some(align) = legacy.text_alignment {
            self.align = align;
        }
        if let Some(background_color) = legacy.background_color {
            self.background_color = background_color;
        }
        if let Some(transparency) = legacy.transparency {
            self.background_opacity = transparency;
        }
        if let Some(font_size) = legacy.font_size {
            self.font_size = font_size;
        }
        if let Some(corner_radius) = legacy.corner_radius {
            self.border_radius = corner_radius;
        }
        if let Some(padding_x) = legacy.padding_x {
            self.padding = legacy_padding(padding_x);
        }

        self.normalized()
    }
}

fn legacy_padding(padding_x: i32) -> OverlayPadding {
    match padding_x {
        i32::MIN..=8 => OverlayPadding::None,
        9..=20 => OverlayPadding::Normal,
        _ => OverlayPadding::Large,
    }
}

fn normalize_hex_color(value: &str, fallback: &str) -> String {
    if is_hex_color(value) {
        value.to_string()
    } else {
        fallback.to_string()
    }
}

fn is_hex_color(value: &str) -> bool {
    let Some(hex) = value.strip_prefix('#') else {
        return false;
    };

    matches!(hex.len(), 3 | 6) && hex.chars().all(|c| c.is_ascii_hexdigit())
}

#[cfg(test)]
mod overlay_config_tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn defaults_to_bottom_middle_full_canvas_overlay() {
        let config = OverlayConfig::default();

        assert_eq!(
            config.canvas,
            OverlayCanvas {
                width: 1920,
                height: 1080
            }
        );
        assert_eq!(
            config.layout,
            OverlayLayout {
                anchor: OverlayAnchor::BottomCenter,
                x: 960,
                y: 1037,
                max_width: 1152
            }
        );
        assert_eq!(config.style.align, "center");
        assert_eq!(config.style.font_size, 32);
        assert_eq!(config.style.stroke_color, "#000000");
        assert_eq!(config.style.stroke_width, 0);
        assert_eq!(config.style.background_opacity, 55);
        assert_eq!(config.style.padding, OverlayPadding::Normal);
    }

    #[test]
    fn migrates_legacy_flat_overlay_style() {
        let config: OverlayConfig = serde_json::from_value(json!({
            "name": "default",
            "id": "",
            "text_alignment": "left",
            "background_color": "#123456",
            "transparency": 64,
            "font_size": 38,
            "corner_radius": 18,
            "padding_x": 4,
            "padding_y": 30,
            "font_weight": 700,
            "drop_shadow": false
        }))
        .unwrap();

        assert_eq!(config.style.align, "left");
        assert_eq!(config.style.background_color, "#123456");
        assert_eq!(config.style.background_opacity, 64);
        assert_eq!(config.style.font_size, 38);
        assert_eq!(config.style.border_radius, 18);
        assert_eq!(config.style.padding, OverlayPadding::None);
        assert_eq!(config.layout, OverlayLayout::default());
    }

    #[test]
    fn normalizes_invalid_loaded_values() {
        let config: OverlayConfig = serde_json::from_value(json!({
            "canvas": { "width": 100, "height": 30 },
            "box": { "x": -10, "y": 9999, "w": 10, "h": 10 },
            "style": {
                "align": "diagonal",
                "font_size": 500,
                "text_color": "white",
                "stroke_color": "transparent",
                "stroke_width": 500,
                "background_color": "black",
                "background_opacity": -5,
                "border_radius": 500,
                "padding": "unknown"
            }
        }))
        .unwrap();

        assert_eq!(config.canvas.width, 200);
        assert_eq!(config.canvas.height, 60);
        assert_eq!(
            config.layout,
            OverlayLayout {
                anchor: OverlayAnchor::TopLeft,
                x: 0,
                y: 0,
                max_width: 200
            }
        );
        assert_eq!(config.style.align, "center");
        assert_eq!(config.style.font_size, 96);
        assert_eq!(config.style.text_color, "#ffffff");
        assert_eq!(config.style.stroke_color, "#000000");
        assert_eq!(config.style.stroke_width, 12);
        assert_eq!(config.style.background_color, "#000000");
        assert_eq!(config.style.background_opacity, 0);
        assert_eq!(config.style.border_radius, 64);
        assert_eq!(config.style.padding, OverlayPadding::Normal);
    }

    #[test]
    fn migrating_saved_boxes_preserves_the_anchor_point_and_appearance() {
        let config: OverlayConfig = serde_json::from_value(json!({
            "box": {"x": 725, "y": 897, "w": 1152, "h": 140},
            "style": {"font_size": 48, "text_color": "#abc", "background_opacity": 72}
        }))
        .unwrap();
        assert_eq!(
            config.layout,
            OverlayLayout {
                anchor: OverlayAnchor::BottomRight,
                x: 1877,
                y: 1037,
                max_width: 1152
            }
        );
        assert_eq!(config.style.font_size, 48);
        assert_eq!(config.style.text_color, "#abc");
        assert_eq!(config.style.background_opacity, 72);
        let saved = serde_json::to_value(&config).unwrap();
        assert!(saved.get("box").is_none());
        assert_eq!(
            serde_json::from_value::<OverlayConfig>(saved).unwrap(),
            config
        );
    }

    #[test]
    fn freely_placed_boxes_keep_their_point_after_migration() {
        let config: OverlayConfig = serde_json::from_value(json!({
            "box": {"x": 310, "y": 212, "w": 600, "h": 160}
        }))
        .unwrap();
        assert_eq!(
            config.layout,
            OverlayLayout {
                anchor: OverlayAnchor::TopLeft,
                x: 310,
                y: 212,
                max_width: 600
            }
        );
    }

    #[test]
    fn layout_normalization_keeps_each_anchor_and_width_within_the_canvas() {
        for anchor in OverlayAnchor::ALL {
            let layout = OverlayLayout {
                anchor,
                x: -5000,
                y: 9000,
                max_width: 4000,
            }
            .normalized(&OverlayCanvas::default());
            assert_eq!(layout.max_width, 1920);
            assert_eq!(layout.y, 1080);
            assert_eq!(layout.x, (1920.0 * anchor.factors().0).round() as i32);
        }
    }

    #[test]
    fn clamps_negative_stroke_width_to_zero() {
        let config: OverlayConfig = serde_json::from_value(json!({
            "style": {
                "stroke_width": -4
            }
        }))
        .unwrap();

        assert_eq!(config.style.stroke_width, 0);
    }

    #[test]
    fn maps_legacy_padding_to_presets() {
        assert_eq!(legacy_padding(8), OverlayPadding::None);
        assert_eq!(legacy_padding(12), OverlayPadding::Normal);
        assert_eq!(legacy_padding(24), OverlayPadding::Large);
    }

    #[test]
    fn accepts_old_padding_names() {
        let config: OverlayConfig = serde_json::from_value(json!({
            "style": {
                "align": "center",
                "font_size": 44,
                "text_color": "#ffffff",
                "background_color": "#000000",
                "background_opacity": 55,
                "border_radius": 12,
                "padding": "wide"
            }
        }))
        .unwrap();

        assert_eq!(config.style.padding, OverlayPadding::Large);
    }
}

#[derive(Debug, serde::Serialize, serde::Deserialize, Clone, specta::Type)]
#[serde(default)]
pub struct HomeRightRailSettings {
    pub open: bool,
    pub session: bool,
    pub audio_metrics: bool,
    pub gate: bool,
}

impl Default for HomeRightRailSettings {
    fn default() -> Self {
        Self {
            open: false,
            session: true,
            audio_metrics: false,
            gate: false,
        }
    }
}

#[cfg(test)]
mod ui_settings_tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn new_ui_settings_keep_advanced_details_out_of_the_default_view() {
        let state = AppState::default();

        assert!(!state.home_right_rail.open);
        assert!(state.home_right_rail.session);
        assert!(!state.home_right_rail.audio_metrics);
        assert!(!state.home_right_rail.gate);
        assert!(state.sidebar_open);
    }

    #[test]
    fn legacy_state_preserves_home_detail_sections_and_defaults_new_fields() {
        let state: AppState = serde_json::from_value(json!({
            "home_right_rail": {
                "session": false,
                "audio_metrics": true,
                "gate": true
            }
        }))
        .unwrap();

        assert!(!state.home_right_rail.open);
        assert!(!state.home_right_rail.session);
        assert!(state.home_right_rail.audio_metrics);
        assert!(state.home_right_rail.gate);
        assert!(state.sidebar_open);
    }

    #[test]
    fn persisted_sidebar_state_preserves_a_collapsed_sidebar() {
        let state: AppState = serde_json::from_value(json!({
            "sidebar_open": false
        }))
        .unwrap();

        assert!(!state.sidebar_open);
    }
}

#[derive(Debug, serde::Serialize, serde::Deserialize, Clone, PartialEq, specta::Type)]
#[serde(default)]
pub struct AdvancedSettings {
    pub hallucination_protection_enabled: bool,
    pub vad_sensitivity: scrybe_core::whisper::VadSensitivity,
}

impl Default for AdvancedSettings {
    fn default() -> Self {
        Self {
            hallucination_protection_enabled: true,
            vad_sensitivity: scrybe_core::whisper::VadSensitivity::Balanced,
        }
    }
}

#[derive(Debug, serde::Serialize, serde::Deserialize, Clone, specta::Type)]
pub struct ModelPreset {
    pub id: String,
    pub label: String,
    pub description: String,
    pub repo: String,
    pub filename: String,
    pub size_mb: u16,
    pub resource_rank: u8,
    pub auto_selectable: bool,
}

pub const TINY_MODEL_PRESET_ID: &str = "tiny-q8_0";
pub const BASE_MODEL_PRESET_ID: &str = "base-q8_0";
pub const SMALL_MODEL_PRESET_ID: &str = "small-q8_0";
pub const DEFAULT_MODEL_PRESET_ID: &str = BASE_MODEL_PRESET_ID;
pub const MEDIUM_MODEL_PRESET_ID: &str = "medium-q8_0";
pub const LARGE_V3_TURBO_Q5_MODEL_PRESET_ID: &str = "large-v3-turbo-q5_0";
pub const LARGE_V3_TURBO_Q8_MODEL_PRESET_ID: &str = "large-v3-turbo-q8_0";

pub fn model_presets() -> Vec<ModelPreset> {
    let repo = "ggerganov/whisper.cpp".to_string();
    vec![
        ModelPreset {
            id: TINY_MODEL_PRESET_ID.to_string(),
            label: "Tiny (Q8_0)".to_string(),
            description: "Fastest, lowest quality. ~44 MB.".to_string(),
            repo: repo.clone(),
            filename: "ggml-tiny-q8_0.bin".to_string(),
            size_mb: 44,
            resource_rank: 1,
            auto_selectable: true,
        },
        ModelPreset {
            id: BASE_MODEL_PRESET_ID.to_string(),
            label: "Base (Q8_0)".to_string(),
            description: "Very fast, basic quality. ~82 MB.".to_string(),
            repo: repo.clone(),
            filename: "ggml-base-q8_0.bin".to_string(),
            size_mb: 82,
            resource_rank: 2,
            auto_selectable: true,
        },
        ModelPreset {
            id: SMALL_MODEL_PRESET_ID.to_string(),
            label: "Small (Q8_0)".to_string(),
            description: "Balanced speed and quality. ~264 MB.".to_string(),
            repo: repo.clone(),
            filename: "ggml-small-q8_0.bin".to_string(),
            size_mb: 264,
            resource_rank: 3,
            auto_selectable: false,
        },
        ModelPreset {
            id: MEDIUM_MODEL_PRESET_ID.to_string(),
            label: "Medium (Q8_0)".to_string(),
            description: "Higher quality, slower. ~823 MB.".to_string(),
            repo: repo.clone(),
            filename: "ggml-medium-q8_0.bin".to_string(),
            size_mb: 823,
            resource_rank: 4,
            auto_selectable: false,
        },
        ModelPreset {
            id: LARGE_V3_TURBO_Q5_MODEL_PRESET_ID.to_string(),
            label: "Large v3 Turbo (Q5_0)".to_string(),
            description: "Large-v3 quality, ~8× faster than non-turbo. ~574 MB.".to_string(),
            repo: repo.clone(),
            filename: "ggml-large-v3-turbo-q5_0.bin".to_string(),
            size_mb: 574,
            resource_rank: 5,
            auto_selectable: true,
        },
        ModelPreset {
            id: LARGE_V3_TURBO_Q8_MODEL_PRESET_ID.to_string(),
            label: "Large v3 Turbo (Q8_0)".to_string(),
            description: "Highest quality turbo variant. ~874 MB.".to_string(),
            repo: repo.clone(),
            filename: "ggml-large-v3-turbo-q8_0.bin".to_string(),
            size_mb: 874,
            resource_rank: 6,
            auto_selectable: false,
        },
    ]
}

#[derive(Debug, Default, serde::Serialize, serde::Deserialize, Clone, specta::Type)]
#[serde(default)]
pub struct WebsocketRequest {
    pub kind: String,
    pub data: String,
}

#[derive(Debug, Default, serde::Serialize, serde::Deserialize, Clone, specta::Type)]
#[serde(default)]
pub struct WebsocketResponse {
    pub kind: String,
    pub data: String,
    pub is_error: bool,
}
