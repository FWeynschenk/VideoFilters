const defaults = {
    brightness: {
        v: 1,
        min: 0,
        max: 3,
        step: 0.05,
    },
    contrast: {
        v: 1,
        min: 0,
        max: 3,
        step: 0.05,
    },
    saturate: {
        v: 1,
        min: 0,
        max: 3,
        step: 0.05,
    },
    invert: {
        v: 0,
        min: 0,
        max: 1,
        step: 0.05,
    },
    sepia: {
        v: 0,
        min: 0,
        max: 1,
        step: 0.05,
    },
    opacity: {
        v: 1,
        min: 0,
        max: 1,
        step: 0.05,
    },
    grayscale: {
        v: 0,
        min: 0,
        max: 1,
        step: 0.05,
    },
    hueRotate: {
        v: 0,
        min: 0,
        max: 360,
        step: 1,
    },
    blur: {
        v: 0,
        min: 0,
        max: 16,
        step: 1,
    },
    playbackRate: {
        v: 1,
        min: 0.1,
        max: 4,
        step: 0.1,
    },
    templates: [],
}

chrome.runtime.onInstalled.addListener(() => {
    chrome.storage.sync.get(['defaults'], (data) => {
        if(!data.defaults) {
            chrome.storage.sync.set({ defaults })
        } else {
            if(!data.defaults.saturate && data.defaults.saturation) {
                data.defaults["saturate"] = data.defaults.saturation;
                chrome.storage.sync.set({ defaults: data.defaults })
            }
            if(!data.defaults.templates) {
                data.defaults.templates = [];
                chrome.storage.sync.set({ defaults: data.defaults })
            }
        }
    });

});

// template {name, pf, playbackRate}
