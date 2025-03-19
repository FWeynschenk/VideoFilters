/*
*   MUST:
*       ☺
*   SHOULD:
*       replace await sleep with promisified structure
*   COULD:
*       indentify video on header:hover
*   WONT:
*       download video
*           https://developer.mozilla.org/en-US/docs/Web/API/MediaStream_Recording_API
*/

async function main(defaults) {
    const videosListEl = document.getElementById("videosList");
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    chrome.scripting.executeScript({
        target: { tabId: tab.id, allFrames: true },
        func: () => typeof VF_findVideos !== 'undefined'
    }).then((results) => {
        if (!results[0].result) {
            chrome.scripting.executeScript({
                target: { tabId: tab.id, allFrames: true },
                files: ['shared.js'],
            }, _ => !chrome.runtime.lastError || console.log("Error(injectShared): ", chrome.runtime.lastError));
        }
    });

    const vidMap = {}; // index: { localindex, parsedFilter, playbackRate, windowUri }
    const videoList = []; // accumulator for videos from all frames
    const vidQueue = [];
    let vidCounter = 0;
    let addVideoRunning = false;

    chrome.runtime.onMessage.addListener((request, _, sendResponse) => {
        if (request.greeting === "videos") {
            sendResponse({ greeting: "success" });
            if (request.videos.length > 0) {
                videoList.push(...request.videos);
                vidQueue.push(...request.videos);
                addVideoRunner();
            }
        } else {
            sendResponse({ greeting: "failure" });
        }
    });

    chrome.scripting.executeScript({
        target: { tabId: tab.id, allFrames: true },
        function: () => {
            function mapVid(vid, index) {
                return { index: index, filter: vid.style.filter, playbackRate: vid.playbackRate, uri: window.location.href, width: vid.videoWidth, height: vid.videoHeight };
            }
            let nodes = Array.from(document.querySelectorAll("video, .VF_standin")) ?? [];
            for (const { shadowRoot } of document.querySelectorAll("*")) {
                if (shadowRoot) {
                    nodes = nodes.concat(Array.from(shadowRoot.querySelectorAll("video, .VF_standin")) ?? []);
                }
            }
            const vids = nodes.map(mapVid);
            for (const vid of nodes) {
                vid.disablePictureInPicture = false;
            }
            chrome.runtime.sendMessage({ greeting: "videos", videos: vids });
        },
    }, _ => !chrome.runtime.lastError || console.log("Error(getVids):", chrome.runtime.lastError));

    await sleep(1000).then(() => {
        if (videoList.length === 0) {
            videosListEl.classList.add("noVidsFound");
            videosListEl.innerHTML = `No videos found on page! <br> If there is one, use the feedback button on the options page!`;
        }
    });

    function addVideoRunner() {
        if (addVideoRunning) return;
        addVideoRunning = true;
        if (vidCounter == 0) {
            videosListEl.innerHTML = "";
            videosListEl.classList.remove("noVidsFound");
        }
        vidQueue.sort((a, b) => a.width * a.height - b.width * b.height);
        const newVideo = vidQueue.pop();
        const pf = parseFilter(newVideo.filter);
        const vidUID = `${newVideo.index}-${newVideo.uri}`
        vidMap[vidUID] = { localIndex: newVideo.index, pf: pf, playbackRate: newVideo.playbackRate, uri: newVideo.uri };

        const videoEl = document.createElement("div");
        const vidLabel = document.createElement("h3");
        const reqPIPBtn = document.createElement("button");
        reqPIPBtn.title = "Toggle Picture In Picture";
        reqPIPBtn.addEventListener("click", () => {
            reqPIP(vidMap[vidUID]);
        });

        vidLabel.innerHTML = `Video: ${++vidCounter}`;
        vidLabel.appendChild(reqPIPBtn);
        videoEl.appendChild(vidLabel);
        videosListEl.appendChild(videoEl);

        addFilterElement(videoEl, vidUID, pf, "Brightness:", "brightness");
        addFilterElement(videoEl, vidUID, pf, "Contrast:", "contrast");
        addFilterElement(videoEl, vidUID, pf, "Saturation:", "saturate");
        addFilterElement(videoEl, vidUID, pf, "Invert:", "invert");
        addFilterElement(videoEl, vidUID, pf, "Sepia:", "sepia");
        opacitySettingEL = addFilterElement(videoEl, vidUID, pf, "Opacity:", "opacity");
        addFilterElement(videoEl, vidUID, pf, "Grayscale:", "grayscale");
        addFilterElement(videoEl, vidUID, pf, "Hue:", "hueRotate", (val) => `${val} deg`);
        addFilterElement(videoEl, vidUID, pf, "Blur:", "blur", (val) => `${val} px`);

        addPlaybackRateElement(videoEl, vidUID);

        addPresetSelector(videoEl, vidUID);

        addShaderElements(vidMap[vidUID], videoEl, opacitySettingEL);

        addVideoRunning = false;
        if (vidQueue.length > 0) addVideoRunner();
    }

    function addPresetSelector(videoEl, vidUID, preselectedValue) {
        const presetDiv = document.createElement("div");
        presetDiv.innerHTML = "Presets: ";
        const selectEl = document.createElement("select");

        selectEl.addEventListener("change", (e) => {
            let template = defaults.templates.find((templ) => templ.name == e.target.value);
            if (!template) {
                template = { name: "default", pf: parseFilter(""), playbackRate: defaults.playbackRate.v };
            }

            vidMap[vidUID].playbackRate = template.playbackRate;
            vidMap[vidUID].pf = template.pf;
            setPlaybackRate(vidMap[vidUID]);
            setFilter(vidMap[vidUID]);
            window.dispatchEvent(new CustomEvent("templateChange", { detail: { vidUID: vidUID, templateName: e.target.value } }));
        });

        templateOptionEls(selectEl, "default")
        for (const template of defaults.templates) {
            templateOptionEls(selectEl, template.name);
        }

        const saveBtn = document.createElement("button");
        saveBtn.setAttribute("id", "saveBtn");
        saveBtn.classList.add("addBtn");
        saveBtn.addEventListener("click", () => {
            let presetName = selectEl.value;
            if (!presetName || presetName == "undefined" || presetName == "default") presetName = prompt("Please enter new preset name");
            if (presetName == null || presetName == "") { return; }
            const saveTemplateEvent = new CustomEvent("templateSave", { detail: { vidUID: vidUID, templateName: presetName } });
            defaults.templates = defaults.templates.filter(template => template.name != presetName);
            defaults.templates.push({ name: presetName, pf: vidMap[vidUID].pf, playbackRate: vidMap[vidUID].playbackRate });
            chrome.storage.sync.set({ defaults }).then(() => {
                window.dispatchEvent(saveTemplateEvent);
            });
        });
        const delBtn = document.createElement("button");
        delBtn.setAttribute("id", "delBtn");
        delBtn.addEventListener("click", () => {
            let presetName = selectEl.value;
            if (presetName == null || presetName == "" || presetName == "default") { return; }
            const saveTemplateEvent = new CustomEvent("templateSave");
            defaults.templates = defaults.templates.filter(template => template.name != presetName);
            chrome.storage.sync.set({ defaults }).then(() => {
                window.dispatchEvent(saveTemplateEvent);
            });
        });
        window.addEventListener("templateSave", (e) => {
            presetDiv.remove();
            addPresetSelector(videoEl, vidUID, e.detail?.vidUID == vidUID ? e.detail.templateName : undefined);
        }, { once: true });
        window.addEventListener("templateChange", (e) => {
            if (e.detail.vidUID != vidUID) return;
            selectEl.value = e.detail.templateName;
            updateBtnStates();
        });

        if (preselectedValue) {
            selectEl.value = preselectedValue;
        } else {
            selectEl.value = undefined;
        }

        updateBtnStates();
        presetDiv.appendChild(selectEl);
        presetDiv.appendChild(saveBtn);
        presetDiv.appendChild(delBtn);
        videoEl.appendChild(presetDiv);

        function updateBtnStates() {
            if (!selectEl.value || selectEl.value == "default") {
                saveBtn.classList.add("addBtn");
                delBtn.disabled = true;
            } else {
                delBtn.disabled = false;
                saveBtn.classList.remove("addBtn");
            }
        }
    }

    function templateOptionEls(parent, name) {
        const newOption = document.createElement("option");
        newOption.setAttribute("value", name);
        newOption.innerHTML = name;
        parent.appendChild(newOption);
    }

    function addFilterElement(videoEl, vidUID, pf, label, field, percentFn) {
        const filterDiv = document.createElement("div");
        const labelEl = document.createElement("label");
        labelEl.innerHTML = label;
        const percentEl = document.createElement("span");
        percentEl.innerHTML = percentFn ? percentFn(pf[field]) : `${Math.round(pf[field] * 100)}%`;
        const sliderEl = document.createElement("input");
        sliderEl.type = "range";
        sliderEl.min = defaults[field].min;
        sliderEl.step = defaults[field].step;
        sliderEl.max = defaults[field].max;
        sliderEl.value = pf[field];
        filterDiv.appendChild(labelEl);
        filterDiv.appendChild(sliderEl);
        filterDiv.appendChild(percentEl);
        const resetEl = document.createElement("button");
        resetEl.setAttribute("id", "resetBtn")
        resetEl.disabled = pf[field] == defaults[field].v;
        resetEl.addEventListener("click", () => {
            sliderEl.value = defaults[field].v;
            percentEl.innerHTML = percentFn ? percentFn(sliderEl.value) : `${Math.round(sliderEl.value * 100)}%`;
            vidMap[vidUID].pf[field] = sliderEl.value;
            resetEl.disabled = true;
            setFilter(vidMap[vidUID]);
        });
        sliderEl.addEventListener("input", () => {
            percentEl.innerHTML = percentFn ? percentFn(sliderEl.value) : `${Math.round(sliderEl.value * 100)}%`;
            vidMap[vidUID].pf[field] = sliderEl.value;
            resetEl.disabled = sliderEl.value == defaults[field].v;
            setFilter(vidMap[vidUID]);
        });
        window.addEventListener("templateChange", (e) => {
            if (e.detail.vidUID != vidUID) return;
            const newVal = e.detail.templateName == "default" ? defaults[field].v : vidMap[vidUID].pf[field]
            sliderEl.value = newVal;
            percentEl.innerHTML = percentFn ? percentFn(sliderEl.value) : `${Math.round(sliderEl.value * 100)}%`;
            resetEl.disabled = sliderEl.value == defaults[field].v;
        });
        filterDiv.appendChild(resetEl);
        videoEl.appendChild(filterDiv);
        return filterDiv;
    }

    function addPlaybackRateElement(videoEl, vidUID) {
        const playbackRateDiv = document.createElement("div");
        const playbackRateLabel = document.createElement("label");
        playbackRateLabel.innerHTML = "Speed:";
        const playbackRateMultiplier = document.createElement("span");
        playbackRateMultiplier.innerHTML = `${vidMap[vidUID].playbackRate}x`;
        const playbackRateSlider = document.createElement("input");
        playbackRateSlider.type = "range";
        playbackRateSlider.min = defaults.playbackRate.min;
        playbackRateSlider.step = defaults.playbackRate.step;
        playbackRateSlider.max = defaults.playbackRate.max;
        playbackRateSlider.value = vidMap[vidUID].playbackRate;
        playbackRateDiv.appendChild(playbackRateLabel);
        playbackRateDiv.appendChild(playbackRateSlider);
        playbackRateDiv.appendChild(playbackRateMultiplier);
        const playbackRateReset = document.createElement("button");
        playbackRateReset.setAttribute("id", "resetBtn");
        playbackRateReset.disabled = vidMap[vidUID].playbackRate == defaults.playbackRate.v;
        playbackRateReset.addEventListener("click", () => {
            playbackRateSlider.value = 1;
            playbackRateMultiplier.innerHTML = `${playbackRateSlider.value}x`;
            vidMap[vidUID].playbackRate = playbackRateSlider.value;
            playbackRateReset.disabled = true;
            setPlaybackRate(vidMap[vidUID]);
        });
        playbackRateSlider.addEventListener("input", () => {
            playbackRateMultiplier.innerHTML = `${playbackRateSlider.value}x`;
            vidMap[vidUID].playbackRate = playbackRateSlider.value;
            playbackRateReset.disabled = playbackRateSlider.value == defaults.playbackRate.v;
            setPlaybackRate(vidMap[vidUID]);
        });
        window.addEventListener("templateChange", (e) => {
            if (e.detail.vidUID != vidUID) return;
            playbackRateMultiplier.innerHTML = `${vidMap[vidUID].playbackRate}x`;
            playbackRateSlider.value = vidMap[vidUID].playbackRate;
            playbackRateReset.disabled = playbackRateSlider.value == defaults.playbackRate.v;
        });
        playbackRateDiv.appendChild(playbackRateReset);
        videoEl.appendChild(playbackRateDiv);
    }

    function addShaderElements(video, container, opacitySettingEL) {
        const shaderId = `vf-shader-${video.localIndex}-${video.uri}`;
        
        const checkboxDiv = document.createElement("div");
        checkboxDiv.style.paddingTop = "10px";
        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.id = `${shaderId}-checkbox`;
        checkbox.style.gridColumn = "4";
        const checkboxLabel = document.createElement("label");
        checkboxLabel.htmlFor = `${shaderId}-checkbox`;
        checkboxLabel.textContent = "Shaders";
        checkboxLabel.style.gridColumn = "1 / span 2";
        checkboxLabel.style.fontWeight = "500";
        checkboxDiv.appendChild(checkboxLabel);
        checkboxDiv.appendChild(checkbox);
        container.appendChild(checkboxDiv);

        const shaderFragment = defaults.shader.fragment;
        const uniforms = parseShaderUniforms(shaderFragment);
        for (const [name, props] of Object.entries(uniforms)) {
            const controlDiv = document.createElement("div");
            const label = document.createElement("label");
            label.innerHTML = props.label + ":";
            const valueEl = document.createElement("span");
            valueEl.innerHTML = props.default.toFixed(1);
            valueEl.style.alignSelf = "center";
            const sliderEl = document.createElement("input");
            sliderEl.id = `slider-${shaderId}-${name}`;
            sliderEl.type = "range";
            sliderEl.min = props.min;
            sliderEl.max = props.max;
            sliderEl.value = props.default;
            sliderEl.step = 0.1;
            sliderEl.disabled = true;

            controlDiv.appendChild(label);
            controlDiv.appendChild(sliderEl);
            controlDiv.appendChild(valueEl);

            const resetBtn = document.createElement("button");
            resetBtn.setAttribute("id", "resetBtn");
            resetBtn.disabled = true;
            resetBtn.style.alignSelf = "center";
            resetBtn.addEventListener("click", () => {
                sliderEl.value = props.default;
                valueEl.innerHTML = props.default.toFixed(1);
                resetBtn.disabled = true;
                
                if (checkbox.checked) {
                    chrome.scripting.executeScript({
                        target: { tabId: tab.id },
                        func: (shaderId, value, name) => {
                            const updateUniform = window[`update${name}_${shaderId}`];
                            if (updateUniform) {
                                updateUniform(value);
                                window[`current${name}_${shaderId}`] = value;
                            }
                        },
                        args: [shaderId, props.default, name]
                    });
                }
            });

            sliderEl.addEventListener("input", () => {
                const value = parseFloat(sliderEl.value);
                valueEl.innerHTML = value.toFixed(1);
                resetBtn.disabled = value === props.default;
                
                if (checkbox.checked) {
                    chrome.scripting.executeScript({
                        target: { tabId: tab.id },
                        func: (shaderId, value, name) => {
                            const updateUniform = window[`update${name}_${shaderId}`];
                            if (updateUniform) {
                                updateUniform(value);
                                window[`current${name}_${shaderId}`] = value;
                            }
                        },
                        args: [shaderId, value, name]
                    });
                }
            });

            controlDiv.appendChild(resetBtn);
            container.appendChild(controlDiv);
        }

        // Check if shader is already active for this video
        chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: (shaderId, uniforms) => {
                const canvas = document.getElementById(shaderId);
                const dynamicUniforms = [];
                for (const [name, props] of Object.entries(uniforms)) {
                    dynamicUniforms.push({
                        name: name,
                        value: window[`current${name}_${shaderId}`] || props.default,
                        defaultValue: props.default,
                    });
                }
                if (canvas) {
                    const currentUniforms = {
                        isActive: true,
                        dynamic: dynamicUniforms,
                    };
                    
                    return currentUniforms;
                }
                return { isActive: false, dynamic: dynamicUniforms };
            },
            args: [shaderId, uniforms]
        }).then((results) => {
            const { isActive, dynamic } = results[0].result;
            if (isActive) {
                checkbox.checked = true;
                opacitySettingEL.querySelectorAll("input").forEach(el => {el.disabled = true; el.value = 0; el.dispatchEvent(new Event('input')); el.parentNode.querySelector("button").disabled = true; });
                
                for (const { name, value, defaultValue } of dynamic) {
                    const slider = document.getElementById(`slider-${shaderId}-${name}`);
                    if (slider) {
                        slider.disabled = false;
                        slider.value = value;
                        const valueEl = slider.nextElementSibling;
                        if (valueEl) {
                            valueEl.innerHTML = value.toFixed(1);
                        }
                        const resetBtn = valueEl.nextElementSibling;
                        if (resetBtn) {
                            resetBtn.disabled = value === defaultValue;
                        }
                    }
                }
            }
        });

        checkbox.onchange = () => {
            // Check if shaders are already injected
            chrome.scripting.executeScript({
                target: { tabId: tab.id },
                func: () => typeof VF_SHADERS !== 'undefined'
            }).then(() => {
                return chrome.storage.sync.get(['defaults']);
            }).then((data) => {
                const shaderStrings = data.defaults.shader;
                return chrome.scripting.executeScript({
                    target: { tabId: tab.id },
                    func: (shaderStrings) => {
                        window.VF_SHADERS = shaderStrings;
                    },
                    args: [shaderStrings]
                });
            }).then(() => {
                // Check if shader is already active
                chrome.scripting.executeScript({
                    target: { tabId: tab.id },
                    func: (shaderId, uniforms) => {
                        const canvas = document.getElementById(shaderId);
                        const dynamicUniforms = [];
                        for (const [name, props] of Object.entries(uniforms)) {
                            dynamicUniforms.push({
                                name: name,
                                value: window[`current${name}_${shaderId}`] || props.default,
                                defaultValue: props.default,
                            });
                        }
                        if (canvas) {
                            return {
                                isActive: true,
                                dynamic: dynamicUniforms,
                            };
                        }
                        return { isActive: false, dynamic: dynamicUniforms };
                    },
                    args: [shaderId, uniforms]
                }).then((results) => {
                    const { isActive, dynamic } = results[0].result;
                    if (isActive) {
                        // Remove shader
                        chrome.scripting.executeScript({
                            target: { tabId: tab.id },
                            func: (shaderId) => {
                                const canvas = document.getElementById(shaderId);
                                if (canvas) {
                                    // Find the video by matching the canvas position with video position
                                    const videos = VF_findVideos();
                                    const video = videos.find(v => {
                                        const vRect = v.getBoundingClientRect();
                                        const cRect = canvas.getBoundingClientRect();
                                        return Math.abs(vRect.left - cRect.left) < 1 && 
                                               Math.abs(vRect.top - cRect.top) < 1;
                                    });
                                    
                                    if (video) {
                                        if (window[`renderCallback_${shaderId}`]) {
                                            video.cancelVideoFrameCallback(window[`renderCallback_${shaderId}`]);
                                            delete window[`renderCallback_${shaderId}`];
                                        }
                                        const originalOpacity = video.getAttribute('data-original-opacity');
                                        if (originalOpacity !== null) {
                                            video.style.opacity = originalOpacity;
                                            video.removeAttribute('data-original-opacity');
                                        } else {
                                            video.style.opacity = '1';
                                        }
                                        
                                        const filterObserver = window[`filterObserver_${shaderId}`];
                                        if (filterObserver) {
                                            filterObserver.disconnect();
                                            delete window[`filterObserver_${shaderId}`];
                                        }
                                    }
                                    canvas.remove();
                                }
                            },
                            args: [shaderId]
                        });
                        checkbox.checked = false;
                        opacitySettingEL.querySelectorAll("input").forEach(el => {el.disabled = false; el.value = 1; el.dispatchEvent(new Event('input'));});
                        for (const { name, defaultValue } of dynamic) {
                            const slider = document.getElementById(`slider-${shaderId}-${name}`);
                            if (slider) {
                                slider.disabled = true;
                                slider.value = defaultValue;
                                slider.parentNode.querySelector("button").disabled = true;
                            }
                        }
                    } else {
                        // Add shader
                        chrome.scripting.executeScript({
                            target: { tabId: tab.id },
                            func: (videoIndex, shaderId, uniforms) => {
                                const videos = VF_findVideos();
                                if (videoIndex >= videos.length) {
                                    console.error('Video index out of range');
                                    return;
                                }
                                const video = videos[videoIndex];
                                
                                const canvas = document.createElement('canvas');
                                canvas.id = shaderId;
                                canvas.width = video.videoWidth;
                                canvas.height = video.videoHeight;
                                
                                const videoStyle = getComputedStyle(video);
                                
                                canvas.style.position = 'absolute';
                                
                                canvas.style.filter = video.style.filter.replace(/opacity\([0-9\.]*\)/i, 'opacity(1)');
                                
                                video.parentNode.insertBefore(canvas, video);
                                
                                video.style.position = videoStyle.position === 'static' ? 'relative' : videoStyle.position;
                                
                                const filterObserver = new MutationObserver((mutations) => {
                                    mutations.forEach((mutation) => {
                                        if (mutation.type === 'attributes' && mutation.attributeName === 'style') {
                                            let newFilter = video.style.filter;
                                            newFilter = newFilter.replace(/opacity\([0-9\.]*\)/i, 'opacity(1)');
                                            canvas.style.filter = newFilter;
                                        }
                                    });
                                });
                                
                                filterObserver.observe(video, {
                                    attributes: true,
                                    attributeFilter: ['style']
                                });
                                
                                window[`filterObserver_${shaderId}`] = filterObserver;
                                
                                const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
                                if (!gl) {
                                    console.error('WebGL not supported');
                                    return;
                                }
                                
                                const vertexShader = gl.createShader(gl.VERTEX_SHADER);
                                gl.shaderSource(vertexShader, VF_SHADERS.vertex);
                                gl.compileShader(vertexShader);
                                
                                const fragmentShader = gl.createShader(gl.FRAGMENT_SHADER);
                                gl.shaderSource(fragmentShader, VF_SHADERS.fragment);
                                gl.compileShader(fragmentShader);
                                
                                const program = gl.createProgram();
                                gl.attachShader(program, vertexShader);
                                gl.attachShader(program, fragmentShader);
                                gl.linkProgram(program);
                                gl.useProgram(program);
                                
                                if (!gl.getShaderParameter(vertexShader, gl.COMPILE_STATUS)) {
                                    console.error('Vertex shader compilation failed:', gl.getShaderInfoLog(vertexShader));
                                    return;
                                }
                                if (!gl.getShaderParameter(fragmentShader, gl.COMPILE_STATUS)) {
                                    console.error('Fragment shader compilation failed:', gl.getShaderInfoLog(fragmentShader));
                                    return;
                                }
                                if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
                                    console.error('Shader program linking failed:', gl.getProgramInfoLog(program));
                                    return;
                                }
                                
                                const positionBuffer = gl.createBuffer();
                                gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
                                gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
                                    -1.0, -1.0,
                                    1.0, -1.0,
                                    -1.0,  1.0,
                                    -1.0,  1.0,
                                    1.0, -1.0,
                                    1.0,  1.0
                                ]), gl.STATIC_DRAW);
                                
                                const texCoordBuffer = gl.createBuffer();
                                gl.bindBuffer(gl.ARRAY_BUFFER, texCoordBuffer);
                                gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
                                    0.0, 1.0,
                                    1.0, 1.0,
                                    0.0, 0.0,
                                    0.0, 0.0,
                                    1.0, 1.0,
                                    1.0, 0.0 
                                ]), gl.STATIC_DRAW);
                                
                                const texture = gl.createTexture();
                                gl.bindTexture(gl.TEXTURE_2D, texture);
                                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
                                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
                                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
                                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
                                
                                const positionLocation = gl.getAttribLocation(program, "a_position");
                                const texCoordLocation = gl.getAttribLocation(program, "a_texCoord");
                                const textureSizeLocation = gl.getUniformLocation(program, "u_textureSize");
                                const textureLocation = gl.getUniformLocation(program, "u_texture");

                                gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
                                gl.enableVertexAttribArray(positionLocation);
                                gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);
                                
                                gl.bindBuffer(gl.ARRAY_BUFFER, texCoordBuffer);
                                gl.enableVertexAttribArray(texCoordLocation);
                                gl.vertexAttribPointer(texCoordLocation, 2, gl.FLOAT, false, 0, 0);

                                const dynamicLocations = {};
                                for (const [name, props] of Object.entries(uniforms)) {
                                    const location = gl.getUniformLocation(program, `${name}`);
                                    if (location) {
                                        dynamicLocations[name] = location;
                                        gl.uniform1f(location, props.default);
                                        window[`current${name}_${shaderId}`] = props.default;                                      
                                    } else {
                                        console.error(`Uniform ${name} not found. Something is wrong with the shader.`);
                                    }
                                }                                
                                                                
                                const updateCanvasPosition = () => {
                                    canvas.style.zIndex = video.style.zIndex || 'auto';

                                    const videoRect = video.getBoundingClientRect();
                                    
                                    const videoAspectRatio = video.videoWidth / video.videoHeight;
                                    const screenAspectRatio = videoRect.width / videoRect.height;

                                    if (screenAspectRatio > videoAspectRatio + 0.005) { // Wider screen: fit to height
                                        canvas.style.height = videoRect.height + 'px';
                                        canvas.style.width = (videoRect.height * videoAspectRatio) + 'px';
                                        // Center horizontally
                                        canvas.style.left = (videoRect.width - canvas.offsetWidth) / 2 + 'px';
                                        canvas.style.top = video.style.top;
                                        canvas.style.right = video.style.right;
                                        canvas.style.bottom = video.style.bottom;
                                    } else if (screenAspectRatio < videoAspectRatio - 0.005) { // Taller screen: fit to width
                                        canvas.style.width = videoRect.width + 'px';
                                        canvas.style.height = (videoRect.width / videoAspectRatio) + 'px';
                                        // Center vertically
                                        canvas.style.top = (videoRect.height - canvas.offsetHeight) / 2 + 'px';
                                        canvas.style.left = video.style.left;
                                        canvas.style.right = video.style.right;
                                        canvas.style.bottom = video.style.bottom;
                                    } else { // Square screen
                                        canvas.style.width = videoRect.width + 'px';
                                        canvas.style.height = videoRect.height + 'px';
                                        canvas.style.left = video.style.left;
                                        canvas.style.right = video.style.right;
                                        canvas.style.top = video.style.top;
                                        canvas.style.bottom = video.style.bottom;
                                    }
                                
                                    canvas.style.zIndex = video.style.zIndex || 'auto';
                                    
                                    canvas.width = video.videoWidth;
                                    canvas.height = video.videoHeight;

                                    gl.viewport(0, 0, canvas.width, canvas.height);
                                };
                                updateCanvasPosition();
                                
                                const resizeObserver = new ResizeObserver(updateCanvasPosition);
                                resizeObserver.observe(video);
                                window.addEventListener('scroll', updateCanvasPosition, { passive: true });
                                video.addEventListener('fullscreenchange', updateCanvasPosition, { passive: true });
                                
                                // TODO render every other frame option for performance
                                function render(forced) {
                                    gl.bindTexture(gl.TEXTURE_2D, texture);
                                    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);
                                    gl.uniform2f(textureSizeLocation, video.videoWidth, video.videoHeight);
                                    gl.uniform1i(textureLocation, 0);
                                                                        
                                    for (const [name, props] of Object.entries(uniforms)) {
                                        if (props.type === 'float') {
                                            gl.uniform1f(dynamicLocations[name], window[`current${name}_${shaderId}`]);
                                        }
                                    }
                                    
                                    gl.viewport(0, 0, canvas.width, canvas.height);
                                    gl.clearColor(0, 0, 0, 0);
                                    gl.clear(gl.COLOR_BUFFER_BIT);
                                    gl.drawArrays(gl.TRIANGLES, 0, 6);

                                    if (!forced) window[`renderCallback_${shaderId}`] = video.requestVideoFrameCallback(()=>render(false));
                                }
                                render(false);
                                
                                for (const [name, props] of Object.entries(uniforms)) {
                                    if (props.type === 'float') {
                                        window[`update${name}_${shaderId}`] = (value) => {
                                            window[`current${name}_${shaderId}`] = value;
                                            render(true);
                                        };
                                    }
                                }
                            },
                            args: [video.localIndex, shaderId, uniforms]
                        });
                        checkbox.checked = true;
                        opacitySettingEL.querySelectorAll("input").forEach(el => {el.disabled = true; el.value = 0; el.dispatchEvent(new Event('input')); el.parentNode.querySelector("button").disabled = true;});
                        for (const { name } of dynamic) {
                            const slider = document.getElementById(`slider-${shaderId}-${name}`);
                            if (slider) {
                                slider.disabled = false;
                            }
                        }
                    }
                });
            });
        };
    }

    function setFilter(video) {
        const filter = video.pf;
        chrome.storage.local.set({ videoStyleFilter: pfToString(filter) });
        chrome.storage.local.set({ videoIndex: video.localIndex });
        chrome.storage.local.set({ frameUri: video.uri });
        chrome.scripting.executeScript({
            target: { tabId: tab.id, allFrames: true },
            function: () => {
                chrome.storage.local.get("frameUri", (data) => {
                    if (window.location.href !== data.frameUri) return;
                    chrome.storage.local.get("videoIndex", (videoIndex) => {
                        const nodes = VF_findVideos();
                        const vid = nodes[videoIndex.videoIndex];
                        chrome.storage.local.get("videoStyleFilter", (videoStyleFilter) => {
                            vid.style.filter = videoStyleFilter.videoStyleFilter;
                        });
                    });
                });
            },
        }, _ => !chrome.runtime.lastError || console.log("Error(setFilter): ", chrome.runtime.lastError));
    }

    function setPlaybackRate(video) {
        const playbackRate = video.playbackRate;
        chrome.storage.local.set({ videoPlaybackRate: playbackRate });
        chrome.storage.local.set({ videoIndex: video.localIndex });
        chrome.storage.local.set({ frameUri: video.uri });
        chrome.scripting.executeScript({
            target: { tabId: tab.id, allFrames: true },
            function: () => {
                chrome.storage.local.get("frameUri", (data) => {
                    if (window.location.href !== data.frameUri) return;
                    chrome.storage.local.get("videoIndex", (videoIndex) => {
                        const nodes = VF_findVideos();
                        const vid = nodes[videoIndex.videoIndex];
                        chrome.storage.local.get("videoPlaybackRate", (videoPlaybackRate) => {
                            vid.playbackRate = videoPlaybackRate.videoPlaybackRate;
                        });
                    });
                });
            },
        }, _ => !chrome.runtime.lastError || console.log("Error(setPlayBackRate): ", chrome.runtime.lastError));
    }

    function reqPIP(video) {
        chrome.storage.local.set({ videoIndex: video.localIndex });
        chrome.storage.local.set({ frameUri: video.uri });
        chrome.scripting.executeScript({
            target: { tabId: tab.id, allFrames: true },
            function: () => {
                chrome.storage.local.get("frameUri", (data) => {
                    if (window.location.href !== data.frameUri) return;
                    chrome.storage.local.get("videoIndex", async (videoIndex) => {
                        const nodes = VF_findVideos();
                        const vid = nodes[videoIndex.videoIndex];
                        chrome.storage.sync.get("advancedPIPEnabled", async enabled => {
                            if (enabled.advancedPIPEnabled) {
                                if (document.VF_pipIndex !== videoIndex.videoIndex) {
                                    document.VF_pipIndex = videoIndex.videoIndex;
                                    document.VF_vidRef = vid;
                                    document.VF_vidContRef = vid.parentElement;
                                    document.VF_vidIndex = VF_getElementIndex(vid);
                                    document.VF_vidWidth = vid.style?.width ?? 0;
                                    document.VF_vidHeight = vid.style?.height ?? 0;

                                    document.VF_standinEl = document.createElement("div");
                                    document.VF_standinEl.style = {};
                                    document.VF_standinEl.width = vid.clientWidth;
                                    document.VF_standinEl.height = vid.clientHeight;
                                    document.VF_standinEl.uri = vid.uri;
                                    document.VF_standinEl.index = vid.index;
                                    Object.defineProperty(document.VF_standinEl, 'playbackRate', {
                                        get: () => vid.playbackRate,
                                        set: function (value) {
                                            vid.playbackRate = value;
                                        }
                                    });
                                    Object.defineProperty(document.VF_standinEl.style, 'filter', {
                                        get: () => vid.style.filter,
                                        set: function (value) {
                                            vid.style.filter = value;
                                        }
                                    });

                                    document.VF_standinEl.classList.add("VF_standin");

                                    document.pipWindow = await window.documentPictureInPicture.requestWindow({
                                        width: vid.clientWidth,
                                        height: vid.clientHeight,
                                    });
                                    document.pipWindow.document.body.style = "margin: 0; background-color: black;"
                                    document.pipWindow.addEventListener("pagehide", VF_clearDocPIP);

                                    document.pipWindow.document.body.append(vid);
                                    document.pipWindow.document.body.addEventListener("click", () => {
                                        vid.paused ? vid.play() : vid.pause();
                                    });

                                    VF_insertAt(document.VF_vidContRef, document.VF_standinEl, document.VF_vidIndex); // set VF_standin at original video position.
                                    vid.style.width = "100vw"; // "fill window"
                                    vid.style.height = "100vh";
                                    if(!vid.controls) {
                                        document.VF_addedControls = true;
                                        vid.setAttribute("controls", "");
                                    }

                                } else {
                                    VF_clearDocPIP();
                                }
                            } else { // simple 
                                if (document.VF_pipIndex !== videoIndex.videoIndex || !document.pictureInPictureElement) {
                                    vid.requestPictureInPicture().then(() => {
                                        document.VF_pipIndex = videoIndex.videoIndex;
                                    });
                                } else {
                                    document.exitPictureInPicture();
                                    document.VF_pipIndex = null;
                                }
                            }
                        })

                    });
                });
            },
        }, _ => !chrome.runtime.lastError || console.log("Error(reqPIP): ", chrome.runtime.lastError));
    }

    function parseFilter(fltr) {
        //  feature = (regex between the parentheses || [0, default]) [capture group]
        let blur = (fltr.match(/blur\((.*?)\)/m) || [0, "0"])[1];
        let brightness = (fltr.match(/brightness\((.*?)\)/m) || [0, "1"])[1];
        let contrast = (fltr.match(/contrast\((.*?)\)/m) || [0, "1"])[1];
        let grayscale = (fltr.match(/grayscale\((.*?)\)/m) || [0, "0"])[1];
        let hueRotate = (fltr.match(/hue-rotate\((.*?)\)/m) || [0, "0"])[1];
        let invert = (fltr.match(/invert\((.*?)\)/m) || [0, "0"])[1];
        let opacity = (fltr.match(/opacity\((.*?)\)/m) || [0, "1"])[1];
        let saturate = (fltr.match(/saturate\((.*?)\)/m) || [0, "1"])[1];
        let sepia = (fltr.match(/sepia\((.*?)\)/m) || [0, "0"])[1];

        if (blur.includes("px")) {
            blur = parseInt(blur.replace("px", ""));
        }
        if (brightness.includes("%")) {
            brightness = parseInt(brightness.replace("%", "")) / 100;
        }
        if (contrast.includes("%")) {
            contrast = parseInt(contrast.replace("%", "")) / 100;
        }
        if (grayscale.includes("%")) {
            grayscale = parseInt(grayscale.replace("%", "")) / 100;
        }
        if (hueRotate.includes("deg")) {
            hueRotate = parseInt(hueRotate.replace("deg", ""));
        }
        if (invert.includes("%")) {
            invert = parseInt(invert.replace("%", "")) / 100;
        }
        if (opacity.includes("%")) {
            opacity = parseInt(opacity.replace("%", "")) / 100;
        }
        if (saturate.includes("%")) {
            saturate = parseInt(saturate.replace("%", "")) / 100;
        }
        if (sepia.includes("%")) {
            sepia = parseInt(sepia.replace("%", "")) / 100;
        }
        return { blur, brightness, contrast, grayscale, hueRotate, invert, opacity, saturate, sepia };
    }

    // turns the filter object into a string suitable for setting the style.filter property
    function pfToString(pf) {
        return `blur(${pf.blur}px) brightness(${pf.brightness}) contrast(${pf.contrast}) saturate(${pf.saturate}) invert(${pf.invert}) sepia(${pf.sepia}) opacity(${pf.opacity}) grayscale(${pf.grayscale}) hue-rotate(${pf.hueRotate}deg)`;
    }
}

// TODO: when chrome.* stops using callbacks refactor this to use promises 
chrome.storage.sync.get("defaults", defaults => {
    main(defaults.defaults);
});

chrome.storage.sync.get("advancedPIPEnabled", enabled => {
    const toggle = document.getElementById("advancedPIP");
    if (enabled.advancedPIPEnabled) toggle.checked = true;
    toggle.addEventListener("change", () => {
        console.log(toggle.checked);
        chrome.storage.sync.set({ "advancedPIPEnabled": toggle.checked });
    });
});

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
