chrome.storage.sync.get(['defaults'], (data) => {
    main(data.defaults)
});

function main(defaults) {
    const defaultListEl = document.getElementById('defaultsList');
    const shaderCodeEl = document.getElementById('shaderCode');
    const shaderInputsEl = document.getElementById('shaderInputs');
    const resetShaderBtn = document.getElementById('resetShader');
    const saveShaderBtn = document.getElementById('saveShader');
    const validateShaderBtn = document.getElementById('validateShader');
    const precisionSelect = document.getElementById('precisionSelect');

    const originalShader = defaultShaderFragment;
    let lastValidatedCode = defaults.shader.fragment;
    let changed = false;
    let validated = true;

    const precisionMatch = defaults.shader.fragment.match(/precision\s+(lowp|mediump|highp)\s+float;/);
    if (precisionMatch) {
        precisionSelect.value = precisionMatch[1];
    }

    precisionSelect.addEventListener('change', () => {
        const shaderCode = shaderCodeEl.value;
        const newPrecision = precisionSelect.value;
        const newPrecisionLine = `precision ${newPrecision} float;`;
        
        if (shaderCode.includes('precision')) {
            shaderCodeEl.value = shaderCode.replace(/precision\s+(lowp|mediump|highp)\s+float;/, newPrecisionLine);
        } else {
            shaderCodeEl.value = newPrecisionLine + '\n' + shaderCode;
        }
        
        changed = true;
        validated = false;
        updateButtonStates();
    });

    const modalContainer = document.createElement('div');
    modalContainer.className = 'modal-overlay';
    modalContainer.style.display = 'none';
    document.body.appendChild(modalContainer);

    function showModal(title, content, onSave, onCancel) {
        const modal = document.createElement('div');
        modal.className = 'modal-dialog';
        
        const header = document.createElement('div');
        header.className = 'modal-header';
        
        const titleEl = document.createElement('h3');
        titleEl.className = 'modal-title';
        titleEl.textContent = title;
        
        const closeBtn = document.createElement('button');
        closeBtn.className = 'modal-close';
        closeBtn.innerHTML = '&times;';
        closeBtn.onclick = () => hideModal();
        
        header.appendChild(titleEl);
        header.appendChild(closeBtn);
        
        const modalContent = document.createElement('div');
        modalContent.className = 'modal-content';
        modalContent.appendChild(content);
        
        const footer = document.createElement('div');
        footer.className = 'modal-footer';
        
        const cancelBtn = document.createElement('button');
        cancelBtn.className = 'modal-button modal-button-secondary';
        cancelBtn.textContent = 'Cancel';
        cancelBtn.onclick = () => {
            if (onCancel) onCancel();
            hideModal();
        };
        
        const saveBtn = document.createElement('button');
        saveBtn.className = 'modal-button modal-button-primary';
        saveBtn.textContent = 'Save';
        saveBtn.onclick = () => {
            if (onSave) onSave();
            hideModal();
        };
        
        footer.appendChild(cancelBtn);
        footer.appendChild(saveBtn);
        
        modal.appendChild(header);
        modal.appendChild(modalContent);
        modal.appendChild(footer);
        
        modalContainer.innerHTML = '';
        modalContainer.appendChild(modal);
        modalContainer.style.display = 'flex';
        
        return { saveBtn, cancelBtn };
    }

    function hideModal() {
        modalContainer.style.display = 'none';
    }

    function hasValueValidationErrors(shaderCode) {
        const uniforms = parseShaderUniforms(shaderCode);
        return Object.values(uniforms).some(props => validateUniformProps(props).length > 0);
    }

    function validateRequiredLines(shaderCode) {
        const requiredLines = [
            { regex: /precision\s+(lowp|mediump|highp)\s+float;/, line: 'precision mediump float;' },
            { regex: /uniform\s+sampler2D\s+u_texture;/, line: 'uniform sampler2D u_texture;' },
            { regex: /uniform\s+vec2\s+u_textureSize;/, line: 'uniform vec2 u_textureSize;' },
            { regex: /varying\s+vec2\s+v_texCoord;/, line: 'varying vec2 v_texCoord;' }
        ];

        const missingLines = requiredLines.filter(lineObj => !lineObj.regex.test(shaderCode));
        
        if (missingLines.length > 0) {
            return missingLines.map(lineObj => `Add this line: \`${lineObj.line}\``);
        }
        return [];
    }

    function updateButtonStates() {
        validateShaderBtn.disabled = !changed || validated;
        saveShaderBtn.disabled = !changed || !validated;
    }

    function validateUniformProps(props) {
        const errors = [];
        
        if (props.type !== 'float') {
            errors.push(`Type must be float not '${props.type}'`);
            return errors;
        }
        
        if (isNaN(props.min) || isNaN(props.max) || isNaN(props.default)) {
            errors.push('Values must be numbers');
            return errors;
        }

        if (props.max <= props.min) {
            errors.push('Max must be greater than min');
        }

        if (props.default < props.min || props.default > props.max) {
            errors.push('Default value must be within min/max range');
        }

        return errors;
    }

    function createUniformEditModal(name, props) {
        const content = document.createElement('div');
        
        const minGroup = document.createElement('div');
        minGroup.className = 'modal-input-group';
        const minLabel = document.createElement('label');
        minLabel.textContent = 'Minimum Value';
        const minInput = document.createElement('input');
        minInput.type = 'number';
        minInput.value = props.min;
        minInput.step = 'any';
        minGroup.appendChild(minLabel);
        minGroup.appendChild(minInput);
        
        const maxGroup = document.createElement('div');
        maxGroup.className = 'modal-input-group';
        const maxLabel = document.createElement('label');
        maxLabel.textContent = 'Maximum Value';
        const maxInput = document.createElement('input');
        maxInput.type = 'number';
        maxInput.value = props.max;
        maxInput.step = 'any';
        maxGroup.appendChild(maxLabel);
        maxGroup.appendChild(maxInput);
        
        const defaultGroup = document.createElement('div');
        defaultGroup.className = 'modal-input-group';
        const defaultLabel = document.createElement('label');
        defaultLabel.textContent = 'Default Value';
        const defaultInput = document.createElement('input');
        defaultInput.type = 'number';
        defaultInput.value = props.default;
        defaultInput.step = 'any';
        defaultGroup.appendChild(defaultLabel);
        defaultGroup.appendChild(defaultInput);
        
        const errorDiv = document.createElement('div');
        errorDiv.className = 'error-message';
        errorDiv.style.display = 'none';
        
        content.appendChild(minGroup);
        content.appendChild(maxGroup);
        content.appendChild(defaultGroup);
        content.appendChild(errorDiv);
        
        function validateInputs() {
            const min = parseFloat(minInput.value);
            const max = parseFloat(maxInput.value);
            const def = parseFloat(defaultInput.value);
            
            const errors = [];
            if (isNaN(min) || isNaN(max) || isNaN(def)) {
                errors.push('All values must be numbers');
            } else {
                if (max <= min) {
                    errors.push('Max must be greater than min');
                }
                if (def < min || def > max) {
                    errors.push('Default value must be within min/max range');
                }
            }
            
            errorDiv.textContent = errors.join(', ');
            errorDiv.style.display = errors.length > 0 ? 'block' : 'none';
            return errors.length === 0;
        }
        
        function updateShaderCode() {
            const min = parseFloat(minInput.value);
            const max = parseFloat(maxInput.value);
            const def = parseFloat(defaultInput.value);
            
            const shaderCode = shaderCodeEl.value;
            const uniformRegex = new RegExp(`uniform\\s+float\\s+${name}\\s*;\\s*//\\s*\\[min:\\s*[^\\]]+\\]`);
            const newUniform = `uniform float ${name}; // [min: ${min}, max: ${max}, default: ${def}, label: ${props.label}]`;
            
            shaderCodeEl.value = shaderCode.replace(uniformRegex, newUniform);
            changed = true;
            validated = false;
            updateButtonStates();
            createShaderInputs(shaderCodeEl.value);
        }
        
        const { saveBtn } = showModal(`Edit ${props.label || name}`, content, () => {
            if (validateInputs()) {
                updateShaderCode();
            }
        });
        
        saveBtn.disabled = !validateInputs();
        
        [minInput, maxInput, defaultInput].forEach(input => {
            input.addEventListener('input', () => {
                saveBtn.disabled = !validateInputs();
            });
        });
    }

    function createShaderInputs(shaderCode, requiredLineErrors) {
        const uniforms = parseShaderUniforms(shaderCode);
        shaderInputsEl.innerHTML = '';
        
        if (requiredLineErrors && requiredLineErrors.length > 0) {
            const errorSection = document.createElement('div');
            errorSection.className = 'shader-error-section';
            shaderInputsEl.appendChild(errorSection);
            errorSection.innerHTML = '<div class="error-message">Required shader lines missing:<br>' + 
                requiredLineErrors.map(error => error).join('<br>') + '</div>';
        }
        
        const heading = document.createElement('h3');
        heading.textContent = 'Shader Inputs:';
        shaderInputsEl.appendChild(heading);
        
        const gridContainer = document.createElement('div');
        gridContainer.className = 'shader-uniforms-grid';
        
        Object.entries(uniforms).forEach(([name, props]) => {
            const div = document.createElement('div');
            div.className = 'shader-input';
            
            const errors = validateUniformProps(props);
            if (errors.length > 0) {
                div.classList.add('shader-input-error');
            }

            const label = document.createElement('label');
            label.textContent = `${props.label || name}: `;
            
            const info = document.createElement('span');
            info.className = 'shader-uniform-info';
            info.innerHTML = `
                Min: ${props.min}
                <br>Max: ${props.max}
                <br>Default: ${props.default}
                ${errors.length > 0 ? `<br><span class="error-message">${errors.join(', ')}</span>` : ''}
            `;
            
            div.appendChild(label);
            div.appendChild(info);
            
            div.addEventListener('click', () => {
                createUniformEditModal(name, props);
            });
            
            gridContainer.appendChild(div);
        });

        shaderInputsEl.appendChild(gridContainer);
        updateButtonStates();
    }

    shaderCodeEl.value = defaults.shader.fragment;
    createShaderInputs(defaults.shader.fragment);

    shaderCodeEl.addEventListener('input', () => {
        changed = shaderCodeEl.value !== lastValidatedCode;
        validated = false;
        updateButtonStates();
    });

    resetShaderBtn.addEventListener('click', () => {
        if (confirm('Are you sure you want to reset to the default shader? This will permanently delete your current shader.')) {
            shaderCodeEl.value = originalShader;
            defaults.shader.fragment = originalShader;
            chrome.storage.sync.set({ defaults });
            lastValidatedCode = originalShader;
            changed = false;
            validated = true;
            createShaderInputs(originalShader);
        }
    });

    validateShaderBtn.addEventListener('click', () => {
        const requiredLineErrors = validateRequiredLines(shaderCodeEl.value);
        if (!hasValueValidationErrors(shaderCodeEl.value)) {
            if (requiredLineErrors.length === 0) {
                validated = true;
                lastValidatedCode = shaderCodeEl.value;
            } else {
                validated = false;
            }
        }
        createShaderInputs(shaderCodeEl.value, requiredLineErrors);
    });

    saveShaderBtn.addEventListener('click', () => {
        defaults.shader.fragment = shaderCodeEl.value;
        chrome.storage.sync.set({ defaults });
        lastValidatedCode = shaderCodeEl.value;
        changed = false;
        validated = true;
        createShaderInputs(defaults.shader.fragment);
    });

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
    maxInputEl('Maximum Saturation: ', 'x', 'number', 'saturate');
    maxInputEl('Maximum Blur: ', 'px', 'number', 'blur');
    maxInputEl('Maximum Playback Rate: ', 'x', 'number', 'playbackRate');
}

