use crate::types::{
    BASE_MODEL_PRESET_ID, LARGE_V3_TURBO_Q5_MODEL_PRESET_ID, TINY_MODEL_PRESET_ID,
};
use sysinfo::{MemoryRefreshKind, RefreshKind, System};

const BYTES_PER_GIB: u64 = 1024 * 1024 * 1024;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) struct HardwareProfile {
    pub total_memory_gib: Option<u64>,
    pub logical_cpus: Option<usize>,
    pub accelerated_backend: bool,
}

pub(crate) fn collect_hardware_profile(accelerated_backend: bool) -> HardwareProfile {
    let system = System::new_with_specifics(
        RefreshKind::nothing().with_memory(MemoryRefreshKind::nothing().with_ram()),
    );

    HardwareProfile {
        total_memory_gib: bytes_to_gib(system.total_memory()),
        logical_cpus: std::thread::available_parallelism()
            .ok()
            .map(|threads| threads.get())
            .filter(|threads| *threads > 0),
        accelerated_backend,
    }
}

pub(crate) fn select_initial_model_preset_id(profile: HardwareProfile) -> &'static str {
    let Some(total_memory_gib) = profile.total_memory_gib.filter(|value| *value > 0) else {
        return TINY_MODEL_PRESET_ID;
    };
    let Some(logical_cpus) = profile.logical_cpus.filter(|value| *value > 0) else {
        return TINY_MODEL_PRESET_ID;
    };

    if total_memory_gib < 8 || logical_cpus <= 4 {
        return TINY_MODEL_PRESET_ID;
    }

    if (profile.accelerated_backend && total_memory_gib >= 24 && logical_cpus >= 8)
        || (total_memory_gib >= 32 && logical_cpus >= 12)
    {
        return LARGE_V3_TURBO_Q5_MODEL_PRESET_ID;
    }

    BASE_MODEL_PRESET_ID
}

fn bytes_to_gib(bytes: u64) -> Option<u64> {
    let gib = bytes / BYTES_PER_GIB;
    (gib > 0).then_some(gib)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::{
        model_presets, LARGE_V3_TURBO_Q8_MODEL_PRESET_ID, MEDIUM_MODEL_PRESET_ID,
        SMALL_MODEL_PRESET_ID,
    };

    fn profile(
        total_memory_gib: Option<u64>,
        logical_cpus: Option<usize>,
        accelerated_backend: bool,
    ) -> HardwareProfile {
        HardwareProfile {
            total_memory_gib,
            logical_cpus,
            accelerated_backend,
        }
    }

    #[test]
    fn selects_tiny_when_profile_is_missing_or_zero() {
        assert_eq!(
            select_initial_model_preset_id(profile(None, Some(8), true)),
            TINY_MODEL_PRESET_ID
        );
        assert_eq!(
            select_initial_model_preset_id(profile(Some(16), None, true)),
            TINY_MODEL_PRESET_ID
        );
        assert_eq!(
            select_initial_model_preset_id(profile(Some(0), Some(8), true)),
            TINY_MODEL_PRESET_ID
        );
        assert_eq!(
            select_initial_model_preset_id(profile(Some(16), Some(0), true)),
            TINY_MODEL_PRESET_ID
        );
    }

    #[test]
    fn selects_tiny_for_low_resource_hardware() {
        assert_eq!(
            select_initial_model_preset_id(profile(Some(7), Some(8), true)),
            TINY_MODEL_PRESET_ID
        );
        assert_eq!(
            select_initial_model_preset_id(profile(Some(16), Some(4), true)),
            TINY_MODEL_PRESET_ID
        );
    }

    #[test]
    fn selects_base_for_modest_hardware() {
        assert_eq!(
            select_initial_model_preset_id(profile(Some(8), Some(8), true)),
            BASE_MODEL_PRESET_ID
        );
        assert_eq!(
            select_initial_model_preset_id(profile(Some(16), Some(6), true)),
            BASE_MODEL_PRESET_ID
        );
    }

    #[test]
    fn selects_base_for_standard_hardware() {
        assert_eq!(
            select_initial_model_preset_id(profile(Some(16), Some(8), true)),
            BASE_MODEL_PRESET_ID
        );
        assert_eq!(
            select_initial_model_preset_id(profile(Some(24), Some(8), false)),
            BASE_MODEL_PRESET_ID
        );
    }

    #[test]
    fn selects_large_v3_turbo_q5_for_high_resource_hardware() {
        assert_eq!(
            select_initial_model_preset_id(profile(Some(24), Some(8), true)),
            LARGE_V3_TURBO_Q5_MODEL_PRESET_ID
        );
        assert_eq!(
            select_initial_model_preset_id(profile(Some(32), Some(12), false)),
            LARGE_V3_TURBO_Q5_MODEL_PRESET_ID
        );
    }

    #[test]
    fn selectable_ids_exist_and_manual_presets_stay_manual() {
        let presets = model_presets();

        for id in [
            TINY_MODEL_PRESET_ID,
            BASE_MODEL_PRESET_ID,
            LARGE_V3_TURBO_Q5_MODEL_PRESET_ID,
        ] {
            let preset = presets
                .iter()
                .find(|preset| preset.id.as_str() == id)
                .expect("auto-selectable preset missing");
            assert!(preset.auto_selectable);
        }

        for id in [
            SMALL_MODEL_PRESET_ID,
            MEDIUM_MODEL_PRESET_ID,
            LARGE_V3_TURBO_Q8_MODEL_PRESET_ID,
        ] {
            let preset = presets
                .iter()
                .find(|preset| preset.id.as_str() == id)
                .expect("manual preset missing");
            assert!(!preset.auto_selectable);
        }
    }
}
