#[derive(Debug, serde::Serialize, serde::Deserialize, Clone, specta::Type)]
#[serde(default)]
pub struct AppState {
    pub current_device: scrybe_core::devices::AudioDevice,
    pub audio_format: scrybe_core::devices::AudioFormat,
    pub model_path: String,
    pub audio_segment_size: u64,
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
        Self {
            x: 384,
            y: 880,
            w: 1152,
            h: 100,
        }
    }
}

impl OverlayBox {
    fn lower_third(canvas: &OverlayCanvas) -> Self {
        let w = (canvas.width * 60) / 100;
        let h = (canvas.height * 10) / 100;
        Self {
            x: (canvas.width - w) / 2,
            y: (canvas.height * 82) / 100,
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
    pub background_color: String,
    pub background_opacity: i32,
    pub border_radius: i32,
    pub padding: OverlayPadding,
}

impl Default for OverlayStyle {
    fn default() -> Self {
        Self {
            align: "center".to_string(),
            font_size: 44,
            text_color: "#ffffff".to_string(),
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
    #[serde(rename = "box")]
    pub r#box: OverlayBox,
    pub style: OverlayStyle,
}

impl Default for OverlayConfig {
    fn default() -> Self {
        let canvas = OverlayCanvas::default();
        Self {
            r#box: OverlayBox::default().clamp_to(&canvas),
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

        config.r#box = wire
            .r#box
            .unwrap_or_else(|| {
                if has_v2_canvas {
                    OverlayBox::lower_third(&config.canvas)
                } else {
                    OverlayBox::default()
                }
            })
            .clamp_to(&config.canvas);
        config
    }
}

#[derive(Default, serde::Deserialize)]
#[serde(default)]
struct OverlayConfigWire {
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
    fn defaults_to_lower_third_full_canvas_overlay() {
        let config = OverlayConfig::default();

        assert_eq!(
            config.canvas,
            OverlayCanvas {
                width: 1920,
                height: 1080
            }
        );
        assert_eq!(
            config.r#box,
            OverlayBox {
                x: 384,
                y: 880,
                w: 1152,
                h: 100
            }
        );
        assert_eq!(config.style.align, "center");
        assert_eq!(config.style.font_size, 44);
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
        assert_eq!(config.r#box, OverlayBox::default());
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
            config.r#box,
            OverlayBox {
                x: 0,
                y: 0,
                w: 200,
                h: 60
            }
        );
        assert_eq!(config.style.align, "center");
        assert_eq!(config.style.font_size, 96);
        assert_eq!(config.style.text_color, "#ffffff");
        assert_eq!(config.style.background_color, "#000000");
        assert_eq!(config.style.background_opacity, 0);
        assert_eq!(config.style.border_radius, 64);
        assert_eq!(config.style.padding, OverlayPadding::Normal);
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
    pub session: bool,
    pub audio_metrics: bool,
    pub gate: bool,
}

impl Default for HomeRightRailSettings {
    fn default() -> Self {
        Self {
            session: false,
            audio_metrics: false,
            gate: false,
        }
    }
}

#[derive(Debug, Default, serde::Serialize, serde::Deserialize, Clone, specta::Type)]
#[serde(default)]
pub struct AdvancedSettings {}

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
