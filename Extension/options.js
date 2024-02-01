chrome.storage.sync.get(['defaults'], (data) => {
    main(data.defaults)
});

function main(defaults) {
    const defaultListEl = document.getElementById('defaultsList');

    function maxInputEl(title, unit, type, field) {
        const divEl = document.createElement('div');
        const labelEl = document.createElement('label');
        const inputEl = document.createElement('input');
        const unitEl = document.createElement('span');
        unitEl.innerHTML = unit;
        labelEl.innerText = title;
        inputEl.type = type;
        inputEl.value = defaults[field].max;
        inputEl.min = defaults[field].min;
        inputEl.addEventListener('change', (e) => {
            defaults[field].max = e.target.value;
            chrome.storage.sync.set({ defaults });
        });
        divEl.appendChild(labelEl);
        divEl.appendChild(inputEl);
        divEl.appendChild(unitEl);
        defaultListEl.appendChild(divEl);
    }
    maxInputEl('Maximum Brightness: ', 'x', 'number', 'brightness');
    maxInputEl('Maximum Contrast: ', 'x', 'number', 'contrast');
    maxInputEl('Maximum Saturation: ', 'x', 'number', 'saturation');
    maxInputEl('Maximum Blur: ', 'px', 'number', 'blur');
    maxInputEl('Maximum Playback Rate: ', 'x', 'number', 'playbackRate');
    
    
    console.log("templates", defaults.templates); //TODO REMOVE
    const addTemplateBtn = document.getElementById('addTemplateBtn');
    addTemplateBtn.addEventListener('click', () => {
        const newTemplateName = prompt("Please enter new preset name:");
        if (newTemplateName == null || newTemplateName == "") { return; }
        addTemplate(newTemplateName)
    })
    
    function addTemplate(name) {
        console.log(name); //TODO
    }
}

