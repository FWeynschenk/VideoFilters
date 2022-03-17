chrome.storage.sync.get(['defaults'], (data) => {
    main(data.defaults)
});

async function main(defaults) {
    const defaultListEl = document.getElementById('defaultsList');
    
    const brightnessDiv = document.createElement('div');
    const brightnessLabel = document.createElement('label');
    const brightnessInput = document.createElement('input');
    const brightnessUnit = document.createElement('span');
    brightnessUnit.innerHTML = 'x';
    brightnessLabel.innerText = 'Maximum Brightness: ';
    brightnessInput.type = 'number';
    brightnessInput.value = defaults.brightness.max;
    brightnessInput.min = defaults.brightness.min;
    brightnessInput.addEventListener('change', (e) => {
        defaults.brightness.max = e.target.value;
        chrome.storage.sync.set({ defaults });
    });
    brightnessDiv.appendChild(brightnessLabel);
    brightnessDiv.appendChild(brightnessInput);
    brightnessDiv.appendChild(brightnessUnit);
    defaultListEl.appendChild(brightnessDiv);

    const contrastDiv = document.createElement('div');
    const contrastLabel = document.createElement('label');
    const contrastInput = document.createElement('input');
    const contrastUnit = document.createElement('span');
    contrastUnit.innerHTML = 'x';
    contrastLabel.innerText = 'Maximum Contrast: ';
    contrastInput.type = 'number';
    contrastInput.value = defaults.contrast.max;
    contrastInput.min = defaults.contrast.min;
    contrastInput.addEventListener('change', (e) => {
        defaults.contrast.max = e.target.value;
        chrome.storage.sync.set({ defaults });
    }
    );
    contrastDiv.appendChild(contrastLabel);
    contrastDiv.appendChild(contrastInput);
    contrastDiv.appendChild(contrastUnit);
    defaultListEl.appendChild(contrastDiv);

    const saturationDiv = document.createElement('div');
    const saturationLabel = document.createElement('label');
    const saturationInput = document.createElement('input');
    const saturationUnit = document.createElement('span');
    saturationUnit.innerHTML = 'x';
    saturationLabel.innerText = 'Maximum Saturation: ';
    saturationInput.type = 'number';
    saturationInput.value = defaults.saturation.max;
    saturationInput.min = defaults.saturation.min;
    saturationInput.addEventListener('change', (e) => {
        defaults.saturation.max = e.target.value;
        chrome.storage.sync.set({ defaults });
    }
    );
    saturationDiv.appendChild(saturationLabel);
    saturationDiv.appendChild(saturationInput);
    saturationDiv.appendChild(saturationUnit);
    defaultListEl.appendChild(saturationDiv);

    const blurDiv = document.createElement('div');
    const blurLabel = document.createElement('label');
    const blurInput = document.createElement('input');
    const blurUnit = document.createElement('span');
    blurUnit.innerHTML = 'px';
    blurLabel.innerText = 'Maximum Blur: ';
    blurInput.type = 'number';
    blurInput.value = defaults.blur.max;
    blurInput.min = defaults.blur.min;
    blurInput.addEventListener('change', (e) => {
        defaults.blur.max = e.target.value;
        chrome.storage.sync.set({ defaults });
    }
    );
    blurDiv.appendChild(blurLabel);
    blurDiv.appendChild(blurInput);
    blurDiv.appendChild(blurUnit);
    defaultListEl.appendChild(blurDiv);

    const playbackRateDiv = document.createElement('div');
    const playbackRateLabel = document.createElement('label');
    const playbackRateInput = document.createElement('input');
    const playbackRateUnit = document.createElement('span');
    playbackRateUnit.innerHTML = 'x';
    playbackRateLabel.innerText = 'Maximum Playback Rate: ';
    playbackRateInput.type = 'number';
    playbackRateInput.value = defaults.playbackRate.max;
    playbackRateInput.min = defaults.playbackRate.min;
    playbackRateInput.addEventListener('change', (e) => {
        defaults.playbackRate.max = e.target.value;
        chrome.storage.sync.set({ defaults });
    }
    );
    playbackRateDiv.appendChild(playbackRateLabel);
    playbackRateDiv.appendChild(playbackRateInput);
    playbackRateDiv.appendChild(playbackRateUnit);
    defaultListEl.appendChild(playbackRateDiv);


}