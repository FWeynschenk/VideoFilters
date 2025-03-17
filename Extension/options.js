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

    // Store the original shader for reset functionality
    const originalShader = defaultShaderFragment;
    let lastValidatedCode = defaults.shader.fragment;
    let changed = false;
    let validated = true;  // Start as true since initial code is valid

    // Function to check if there are any value validation errors
    function hasValueValidationErrors(shaderCode) {
        const uniforms = parseShaderUniforms(shaderCode);
        return Object.values(uniforms).some(props => validateUniformProps(props).length > 0);
    }

    // Function to validate required shader lines
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

    // Function to update button states
    function updateButtonStates() {
        validateShaderBtn.disabled = !changed || validated;
        saveShaderBtn.disabled = !changed || !validated;
    }

    // Function to validate shader uniform properties
    function validateUniformProps(props) {
        const errors = [];
        
        // Check if type is float
        if (props.type !== 'float') {
            errors.push(`Type must be float not '${props.type}'`);
            return errors;
        }
        
        // Check if values are numbers
        if (isNaN(props.min) || isNaN(props.max) || isNaN(props.default)) {
            errors.push('Values must be numbers');
            return errors;
        }

        // Check min/max relationship
        if (props.max <= props.min) {
            errors.push('Max must be greater than min');
        }

        // Check if default is within range
        if (props.default < props.min || props.default > props.max) {
            errors.push('Default value must be within min/max range');
        }

        return errors;
    }

    // Function to create display for shader uniforms
    function createShaderInputs(shaderCode, requiredLineErrors) {
        const uniforms = parseShaderUniforms(shaderCode);
        shaderInputsEl.innerHTML = '';
        
        // Add error display section
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
            gridContainer.appendChild(div);
        });

        shaderInputsEl.appendChild(gridContainer);
        updateButtonStates();
    }

    // Initialize shader editor
    shaderCodeEl.value = defaults.shader.fragment;
    createShaderInputs(defaults.shader.fragment);

    // Track changes in the textarea
    shaderCodeEl.addEventListener('input', () => {
        changed = shaderCodeEl.value !== lastValidatedCode;
        validated = false;
        updateButtonStates();
    });

    // Reset button functionality
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

    // Validate button functionality
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

    // Save button functionality
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

