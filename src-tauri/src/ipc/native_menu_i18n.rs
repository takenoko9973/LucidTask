use std::sync::OnceLock;

use serde::Deserialize;

const SHARED_TASKS_I18N_JA_JSON: &str = include_str!("../../../src/shared/i18n/tasks/ja.json");
const SHARED_TASKS_I18N_EN_JSON: &str = include_str!("../../../src/shared/i18n/tasks/en.json");

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MenuLocale {
    Ja,
    En,
}

impl MenuLocale {
    pub fn parse(value: Option<&str>) -> Self {
        if matches!(value, Some("en")) {
            Self::En
        } else {
            Self::Ja
        }
    }

    pub fn as_code(self) -> &'static str {
        match self {
            Self::Ja => "ja",
            Self::En => "en",
        }
    }

    pub fn app_autostart_label(self) -> &'static str {
        self.labels().app_autostart.as_str()
    }

    pub fn app_language_label(self) -> &'static str {
        self.labels().app_language.as_str()
    }

    pub fn app_language_ja_label(self) -> &'static str {
        self.labels().app_language_ja.as_str()
    }

    pub fn app_language_en_label(self) -> &'static str {
        self.labels().app_language_en.as_str()
    }

    pub fn app_quit_label(self) -> &'static str {
        self.labels().app_quit.as_str()
    }

    pub fn task_pin_on_label(self) -> &'static str {
        self.labels().task_pin_on.as_str()
    }

    pub fn task_pin_off_label(self) -> &'static str {
        self.labels().task_pin_off.as_str()
    }

    pub fn task_edit_label(self) -> &'static str {
        self.labels().task_edit.as_str()
    }

    fn labels(self) -> &'static NativeMenuLabels {
        match self {
            Self::Ja => &native_menu_catalog().ja,
            Self::En => &native_menu_catalog().en,
        }
    }
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct NativeMenuLabelsRaw {
    app_autostart: String,
    app_language: String,
    app_language_ja: String,
    app_language_en: String,
    app_quit: String,
    task_pin_on: String,
    task_pin_off: String,
    task_edit: String,
}

#[derive(Debug, Clone, Deserialize)]
struct LocaleMessagesRaw {
    #[serde(rename = "nativeMenu")]
    native_menu: NativeMenuLabelsRaw,
}

#[derive(Debug, Clone)]
struct NativeMenuLabels {
    app_autostart: String,
    app_language: String,
    app_language_ja: String,
    app_language_en: String,
    app_quit: String,
    task_pin_on: String,
    task_pin_off: String,
    task_edit: String,
}

#[derive(Debug, Clone)]
struct NativeMenuCatalog {
    ja: NativeMenuLabels,
    en: NativeMenuLabels,
}

static NATIVE_MENU_CATALOG: OnceLock<NativeMenuCatalog> = OnceLock::new();

fn native_menu_catalog() -> &'static NativeMenuCatalog {
    NATIVE_MENU_CATALOG.get_or_init(|| {
        let ja = parse_locale_messages(SHARED_TASKS_I18N_JA_JSON);
        let en = parse_locale_messages(SHARED_TASKS_I18N_EN_JSON);

        if let (Some(ja), Some(en)) = (ja, en) {
            return NativeMenuCatalog {
                ja: to_native_menu_labels(ja.native_menu),
                en: to_native_menu_labels(en.native_menu),
            };
        }

        // JSON破損などの異常時は、起動不能を避けるため既定文言へフォールバックする。
        default_native_menu_catalog()
    })
}

fn parse_locale_messages(raw: &str) -> Option<LocaleMessagesRaw> {
    serde_json::from_str::<LocaleMessagesRaw>(raw).ok()
}

fn to_native_menu_labels(raw: NativeMenuLabelsRaw) -> NativeMenuLabels {
    NativeMenuLabels {
        app_autostart: raw.app_autostart,
        app_language: raw.app_language,
        app_language_ja: raw.app_language_ja,
        app_language_en: raw.app_language_en,
        app_quit: raw.app_quit,
        task_pin_on: raw.task_pin_on,
        task_pin_off: raw.task_pin_off,
        task_edit: raw.task_edit,
    }
}

fn default_native_menu_catalog() -> NativeMenuCatalog {
    NativeMenuCatalog {
        ja: NativeMenuLabels {
            app_autostart: "自動起動".to_string(),
            app_language: "言語".to_string(),
            app_language_ja: "日本語".to_string(),
            app_language_en: "English".to_string(),
            app_quit: "終了".to_string(),
            task_pin_on: "Pinする".to_string(),
            task_pin_off: "Pin解除".to_string(),
            task_edit: "編集画面表示".to_string(),
        },
        en: NativeMenuLabels {
            app_autostart: "Auto start".to_string(),
            app_language: "Language".to_string(),
            app_language_ja: "Japanese".to_string(),
            app_language_en: "English".to_string(),
            app_quit: "Quit".to_string(),
            task_pin_on: "Pin".to_string(),
            task_pin_off: "Unpin".to_string(),
            task_edit: "Open edit dialog".to_string(),
        },
    }
}

#[cfg(test)]
mod tests {
    use super::MenuLocale;

    #[test]
    fn parse_falls_back_to_ja_for_unsupported_values() {
        // 仕様: 未対応localeは安全側でjaとして扱う。
        assert_eq!(MenuLocale::parse(Some("en")), MenuLocale::En);
        assert_eq!(MenuLocale::parse(Some("fr")), MenuLocale::Ja);
        assert_eq!(MenuLocale::parse(None), MenuLocale::Ja);
    }

    #[test]
    fn labels_are_loaded_from_shared_json_files() {
        // 仕様: ネイティブメニュー文言は共通i18n JSONから取得される。
        assert_eq!(MenuLocale::Ja.app_quit_label(), "終了");
        assert_eq!(MenuLocale::En.app_language_label(), "Language");
    }
}
