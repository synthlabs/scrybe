// Verifies that detectOsLocale picks the right supported locale for various
// navigator.languages inputs. Run via `pnpm test:i18n`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectOsLocale } from '@synthlabs/i18n/locale';

const SUPPORTED = ['en', 'ru'];
const FALLBACK = 'en';

function withNavigator(languages, language, fn) {
	const prev = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
	Object.defineProperty(globalThis, 'navigator', {
		value: { languages, language: language ?? languages[0] },
		configurable: true,
		writable: true
	});
	try {
		return fn();
	} finally {
		if (prev) Object.defineProperty(globalThis, 'navigator', prev);
		else delete globalThis.navigator;
	}
}

test('exact match on first preferred language', () => {
	withNavigator(['en'], 'en', () => {
		assert.equal(detectOsLocale(SUPPORTED, FALLBACK), 'en');
	});
});

test('exact match on Russian', () => {
	withNavigator(['ru'], 'ru', () => {
		assert.equal(detectOsLocale(SUPPORTED, FALLBACK), 'ru');
	});
});

test('primary subtag match: en-US -> en', () => {
	withNavigator(['en-US'], 'en-US', () => {
		assert.equal(detectOsLocale(SUPPORTED, FALLBACK), 'en');
	});
});

test('primary subtag match: ru-RU -> ru', () => {
	withNavigator(['ru-RU'], 'ru-RU', () => {
		assert.equal(detectOsLocale(SUPPORTED, FALLBACK), 'ru');
	});
});

test('walks priority list to find first supported', () => {
	withNavigator(['de-DE', 'fr-FR', 'ru-RU', 'en-US'], 'de-DE', () => {
		assert.equal(detectOsLocale(SUPPORTED, FALLBACK), 'ru');
	});
});

test('falls back when nothing matches', () => {
	withNavigator(['ja-JP', 'zh-CN'], 'ja-JP', () => {
		assert.equal(detectOsLocale(SUPPORTED, FALLBACK), 'en');
	});
});

test('falls back when navigator missing', () => {
	const prev = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
	delete globalThis.navigator;
	try {
		assert.equal(detectOsLocale(SUPPORTED, FALLBACK), 'en');
	} finally {
		if (prev) Object.defineProperty(globalThis, 'navigator', prev);
	}
});

test('case-insensitive matching', () => {
	withNavigator(['EN-us'], 'EN-us', () => {
		assert.equal(detectOsLocale(SUPPORTED, FALLBACK), 'en');
	});
});
