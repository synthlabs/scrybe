import { SvelteMap } from "svelte/reactivity";
import type { WhisperSegment } from "$lib/bindings";

class Session {
    segments_by_id = new SvelteMap<string, WhisperSegment>();
    current_segment_id = $state<string | null>(null);
    started_at = $state<number | null>(null);

    get segments(): WhisperSegment[] {
        return [...this.segments_by_id.values()].sort(
            (a, b) => a.index - b.index,
        );
    }

    get word_count(): number {
        let count = 0;
        for (const seg of this.segments_by_id.values()) {
            for (const item of seg.items) {
                count += item.text.trim().split(/\s+/).filter(Boolean).length;
            }
        }
        return count;
    }

    get partial_id(): string | null {
        return this.current_segment_id;
    }

    add_segment(seg: WhisperSegment): void {
        this.segments_by_id.set(seg.id, seg);
        this.current_segment_id = seg.id;
    }

    clear(): void {
        this.segments_by_id.clear();
        this.current_segment_id = null;
        this.started_at = null;
    }

    mark_started(): void {
        if (this.started_at === null) {
            this.started_at = Date.now();
        }
    }
}

export const session = new Session();

export const flat_text = (segments: WhisperSegment[]): string =>
    segments
        .map((s) => s.items.map((i) => i.text).join(""))
        .join("\n")
        .trim();

const pad = (n: number): string => n.toString().padStart(2, "0");

export const fmt_duration = (ms: number): string => {
    if (ms < 0 || !Number.isFinite(ms)) ms = 0;
    const total_s = Math.floor(ms / 1000);
    const h = Math.floor(total_s / 3600);
    const m = Math.floor((total_s % 3600) / 60);
    const s = total_s % 60;
    return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
};

export const fmt_started = (epoch_ms: number | null): string => {
    if (epoch_ms === null) return "—";
    const d = new Date(epoch_ms);
    return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export const fmt_segment_timestamp = (start_ms: number): string => {
    if (start_ms < 0 || !Number.isFinite(start_ms)) start_ms = 0;
    const total_s = start_ms / 1000;
    const m = Math.floor(total_s / 60);
    const s = total_s - m * 60;
    return `${pad(m)}:${s.toFixed(1).padStart(4, "0")}`;
};
