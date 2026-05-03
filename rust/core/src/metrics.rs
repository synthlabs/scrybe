#[derive(Debug, serde::Serialize, serde::Deserialize, Clone, specta::Type)]
#[serde(default)]
pub struct AudioMetricsState {
    pub segment_sample_len: u64,
    pub input_rms: f64,
    pub last_inference_ms: f64,
    pub inference_sample_count: u64,
    pub inference_std_dev_ms: f64,
    pub inference_p90_ms: f64,
    pub inference_p95_ms: f64,
    pub inference_p99_ms: f64,
    pub gate_total_evaluations: u64,
    pub gate_total_emits: u64,
    pub gate_emit_rate: f64,
}

impl Default for AudioMetricsState {
    fn default() -> Self {
        Self {
            segment_sample_len: 0,
            input_rms: 0.0,
            last_inference_ms: 0.0,
            inference_sample_count: 0,
            inference_std_dev_ms: 0.0,
            inference_p90_ms: 0.0,
            inference_p95_ms: 0.0,
            inference_p99_ms: 0.0,
            gate_total_evaluations: 0,
            gate_total_emits: 0,
            gate_emit_rate: 0.0,
        }
    }
}

#[derive(Debug, Default)]
pub struct InferenceTimingStats {
    samples: Vec<f64>,
    mean: f64,
    m2: f64,
}

impl InferenceTimingStats {
    pub fn record(&mut self, duration_ms: f64, metrics: &mut AudioMetricsState) {
        if !duration_ms.is_finite() || duration_ms < 0.0 {
            return;
        }

        self.samples.push(duration_ms);

        let count = self.samples.len() as f64;
        let delta = duration_ms - self.mean;
        self.mean += delta / count;
        let delta2 = duration_ms - self.mean;
        self.m2 += delta * delta2;

        metrics.last_inference_ms = duration_ms;
        metrics.inference_sample_count = self.samples.len() as u64;
        metrics.inference_std_dev_ms = self.std_dev();
        metrics.inference_p90_ms = nearest_rank_percentile(&self.samples, 0.90);
        metrics.inference_p95_ms = nearest_rank_percentile(&self.samples, 0.95);
        metrics.inference_p99_ms = nearest_rank_percentile(&self.samples, 0.99);
    }

    fn std_dev(&self) -> f64 {
        if self.samples.is_empty() {
            return 0.0;
        }

        (self.m2 / self.samples.len() as f64).sqrt()
    }
}

pub fn nearest_rank_percentile(samples: &[f64], percentile: f64) -> f64 {
    if samples.is_empty() {
        return 0.0;
    }

    let mut sorted = samples.to_vec();
    sorted.sort_by(|a, b| a.total_cmp(b));

    let percentile = percentile.clamp(0.0, 1.0);
    let rank = (percentile * sorted.len() as f64).ceil() as usize;
    let index = rank.saturating_sub(1).min(sorted.len() - 1);

    sorted[index]
}

pub fn rms_level(samples: &[f32]) -> f64 {
    if samples.is_empty() {
        return 0.0;
    }

    let mean_square = samples
        .iter()
        .map(|sample| {
            let sample = *sample as f64;
            sample * sample
        })
        .sum::<f64>()
        / samples.len() as f64;

    mean_square.sqrt()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rms_level_is_zero_for_empty_samples() {
        assert_eq!(rms_level(&[]), 0.0);
    }

    #[test]
    fn rms_level_calculates_root_mean_square() {
        let rms = rms_level(&[1.0, -1.0, 0.0, 0.0]);

        assert!((rms - std::f64::consts::FRAC_1_SQRT_2).abs() < f64::EPSILON);
    }

    #[test]
    fn nearest_rank_percentile_returns_zero_for_empty_samples() {
        assert_eq!(nearest_rank_percentile(&[], 0.90), 0.0);
    }

    #[test]
    fn nearest_rank_percentile_uses_ceil_rank() {
        let samples = [10.0, 50.0, 30.0, 20.0, 40.0];

        assert_eq!(nearest_rank_percentile(&samples, 0.50), 30.0);
        assert_eq!(nearest_rank_percentile(&samples, 0.90), 50.0);
        assert_eq!(nearest_rank_percentile(&samples, 0.95), 50.0);
        assert_eq!(nearest_rank_percentile(&samples, 0.99), 50.0);
    }

    #[test]
    fn inference_timing_stats_updates_distribution_metrics() {
        let mut stats = InferenceTimingStats::default();
        let mut metrics = AudioMetricsState::default();

        stats.record(100.0, &mut metrics);
        stats.record(200.0, &mut metrics);
        stats.record(300.0, &mut metrics);

        assert_eq!(metrics.last_inference_ms, 300.0);
        assert_eq!(metrics.inference_sample_count, 3);
        assert!((metrics.inference_std_dev_ms - 81.6496580927726).abs() < 0.0000001);
        assert_eq!(metrics.inference_p90_ms, 300.0);
        assert_eq!(metrics.inference_p95_ms, 300.0);
        assert_eq!(metrics.inference_p99_ms, 300.0);
    }
}
