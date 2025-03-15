/*
*   MUST:
*       ☺
*   SHOULD:
*       sort videos by offsetwidth
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

    // Check if shared functions are already injected before injecting them
    chrome.scripting.executeScript({
        target: { tabId: tab.id, allFrames: true },
        func: () => typeof VF_findVideos !== 'undefined'
    }).then((results) => {
        // Only inject if shared functions are not already present
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
                return { index: index, filter: vid.style.filter, playbackRate: vid.playbackRate, uri: window.location.href };
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

    // give it time to find videos before telling user there aren't any
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
        addFilterElement(videoEl, vidUID, pf, "Opacity:", "opacity");
        addFilterElement(videoEl, vidUID, pf, "Grayscale:", "grayscale");
        addFilterElement(videoEl, vidUID, pf, "Hue:", "hueRotate", (val) => `${val} deg`);
        addFilterElement(videoEl, vidUID, pf, "Blur:", "blur", (val) => `${val} px`);

        addPlaybackRateElement(videoEl, vidUID);

        addPresetSelector(videoEl, vidUID);

        addShaderElements(vidMap[vidUID], videoEl);

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
    }

    function addPlaybackRateElement(videoEl, vidUID) {
        //playback rate
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
            //set playbackRate val and update playbackRate
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

    function addShaderElements(video, container) {
        // Create a deterministic ID for this video's shader
        const shaderId = `vf-shader-${video.localIndex}-${video.uri}`;
        
        // Create checkbox container
        const checkboxDiv = document.createElement("div");
        checkboxDiv.style.paddingTop = "10px";
        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.id = `${shaderId}-checkbox`;
        checkbox.style.gridColumn = "4";
        const checkboxLabel = document.createElement("label");
        checkboxLabel.htmlFor = `${shaderId}-checkbox`;
        checkboxLabel.textContent = "Enable Shaders";
        checkboxLabel.style.gridColumn = "1 / span 2";
        checkboxDiv.appendChild(checkboxLabel);
        checkboxDiv.appendChild(checkbox);
        container.appendChild(checkboxDiv);
        

        // Create sharpness controls container
        const sharpnessDiv = document.createElement("div");
        const sharpnessLabel = document.createElement("label");
        sharpnessLabel.innerHTML = "Sharpness:";
        const sharpnessValue = document.createElement("span");
        sharpnessValue.innerHTML = "0.0";
        const sharpnessSlider = document.createElement("input");
        sharpnessSlider.type = "range";
        sharpnessSlider.min = "-1";
        sharpnessSlider.max = "3";
        sharpnessSlider.step = "0.1";
        sharpnessSlider.value = "0.0";
        sharpnessDiv.style.display = "none"; // Initially hidden until shader is active
        
        // Create vignette controls container
        const vignetteDiv = document.createElement("div");
        const vignetteLabel = document.createElement("label");
        vignetteLabel.innerHTML = "Vignette:";
        const vignetteValue = document.createElement("span");
        vignetteValue.innerHTML = "0.0";
        const vignetteSlider = document.createElement("input");
        vignetteSlider.type = "range";
        vignetteSlider.min = "0";
        vignetteSlider.max = "1";
        vignetteSlider.step = "0.1";
        vignetteSlider.value = "0.0";
        vignetteDiv.style.display = "none"; // Initially hidden until shader is active
        
        // Create temperature controls container
        const temperatureDiv = document.createElement("div");
        const temperatureLabel = document.createElement("label");
        temperatureLabel.innerHTML = "Temperature:";
        const temperatureValue = document.createElement("span");
        temperatureValue.innerHTML = "0.0";
        const temperatureSlider = document.createElement("input");
        temperatureSlider.type = "range";
        temperatureSlider.min = "-1";
        temperatureSlider.max = "1";
        temperatureSlider.step = "0.1";
        temperatureSlider.value = "0.0";
        temperatureDiv.style.display = "none"; // Initially hidden until shader is active
        
        // Add elements to containers
        sharpnessDiv.appendChild(sharpnessLabel);
        sharpnessDiv.appendChild(sharpnessSlider);
        sharpnessDiv.appendChild(sharpnessValue);
        
        vignetteDiv.appendChild(vignetteLabel);
        vignetteDiv.appendChild(vignetteSlider);
        vignetteDiv.appendChild(vignetteValue);
        
        temperatureDiv.appendChild(temperatureLabel);
        temperatureDiv.appendChild(temperatureSlider);
        temperatureDiv.appendChild(temperatureValue);

        // Add reset buttons
        const sharpnessReset = document.createElement("button");
        sharpnessReset.setAttribute("id", "resetBtn");
        sharpnessReset.disabled = true;
        sharpnessReset.addEventListener("click", () => {
            sharpnessSlider.value = "0.0";
            sharpnessValue.innerHTML = "0.0";
            sharpnessReset.disabled = true;
            
            if (checkbox.checked) {
                chrome.scripting.executeScript({
                    target: { tabId: tab.id },
                    func: (shaderId, value) => {
                        const updateSharpness = window[`updateSharpness_${shaderId}`];
                        if (updateSharpness) {
                            updateSharpness(value);
                            window[`currentSharpness_${shaderId}`] = value;
                        }
                    },
                    args: [shaderId, 0.0]
                });
            }
        });
        
        const vignetteReset = document.createElement("button");
        vignetteReset.setAttribute("id", "resetBtn");
        vignetteReset.disabled = true;
        vignetteReset.addEventListener("click", () => {
            vignetteSlider.value = "0.0";
            vignetteValue.innerHTML = "0.0";
            vignetteReset.disabled = true;
            
            if (checkbox.checked) {
                chrome.scripting.executeScript({
                    target: { tabId: tab.id },
                    func: (shaderId, value) => {
                        const updateVignette = window[`updateVignette_${shaderId}`];
                        if (updateVignette) {
                            updateVignette(value);
                            window[`currentVignette_${shaderId}`] = value;
                        }
                    },
                    args: [shaderId, 0.0]
                });
            }
        });
        
        const temperatureReset = document.createElement("button");
        temperatureReset.setAttribute("id", "resetBtn");
        temperatureReset.disabled = true;
        temperatureReset.addEventListener("click", () => {
            temperatureSlider.value = "0.0";
            temperatureValue.innerHTML = "0.0";
            temperatureReset.disabled = true;
            
            if (checkbox.checked) {
                chrome.scripting.executeScript({
                    target: { tabId: tab.id },
                    func: (shaderId, value) => {
                        const updateTemperature = window[`updateTemperature_${shaderId}`];
                        if (updateTemperature) {
                            updateTemperature(value);
                            window[`currentTemperature_${shaderId}`] = value;
                        }
                    },
                    args: [shaderId, 0.0]
                });
            }
        });

        // Add event listeners for sliders
        sharpnessSlider.addEventListener("input", () => {
            const value = parseFloat(sharpnessSlider.value);
            sharpnessValue.innerHTML = value.toFixed(1);
            sharpnessReset.disabled = value === 0.0;
            
            if (checkbox.checked) {
                chrome.scripting.executeScript({
                    target: { tabId: tab.id },
                    func: (shaderId, value) => {
                        const updateSharpness = window[`updateSharpness_${shaderId}`];
                        if (updateSharpness) {
                            updateSharpness(value);
                            window[`currentSharpness_${shaderId}`] = value;
                        }
                    },
                    args: [shaderId, value]
                });
            }
        });
        
        vignetteSlider.addEventListener("input", () => {
            const value = parseFloat(vignetteSlider.value);
            vignetteValue.innerHTML = value.toFixed(1);
            vignetteReset.disabled = value === 0.0;
            
            if (checkbox.checked) {
                chrome.scripting.executeScript({
                    target: { tabId: tab.id },
                    func: (shaderId, value) => {
                        const updateVignette = window[`updateVignette_${shaderId}`];
                        if (updateVignette) {
                            updateVignette(value);
                            window[`currentVignette_${shaderId}`] = value;
                        }
                    },
                    args: [shaderId, value]
                });
            }
        });
        
        temperatureSlider.addEventListener("input", () => {
            const value = parseFloat(temperatureSlider.value);
            temperatureValue.innerHTML = value.toFixed(1);
            temperatureReset.disabled = value === 0.0;
            
            if (checkbox.checked) {
                chrome.scripting.executeScript({
                    target: { tabId: tab.id },
                    func: (shaderId, value) => {
                        const updateTemperature = window[`updateTemperature_${shaderId}`];
                        if (updateTemperature) {
                            updateTemperature(value);
                            window[`currentTemperature_${shaderId}`] = value;
                        }
                    },
                    args: [shaderId, value]
                });
            }
        });

        // Add reset buttons to containers
        sharpnessDiv.appendChild(sharpnessReset);
        vignetteDiv.appendChild(vignetteReset);
        temperatureDiv.appendChild(temperatureReset);

        // Add containers to main container
        container.appendChild(sharpnessDiv);
        container.appendChild(vignetteDiv);
        container.appendChild(temperatureDiv);

        // Check if shader is already active for this video
        chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: (shaderId) => {
                const canvas = document.getElementById(shaderId);
                if (canvas) {
                    return {
                        isActive: true,
                        sharpness: window[`currentSharpness_${shaderId}`] || 1.0
                    };
                }
                return { isActive: false, sharpness: 1.0 };
            },
            args: [shaderId]
        }).then((results) => {
            const { isActive, sharpness } = results[0].result;
            if (isActive) {
                checkbox.checked = true;
                sharpnessDiv.style.display = "grid";
                sharpnessSlider.value = sharpness;
                sharpnessValue.innerHTML = sharpness.toFixed(1);
                vignetteDiv.style.display = "grid";
                vignetteSlider.value = window[`currentVignette_${shaderId}`] || 0.0;
                vignetteValue.innerHTML = (window[`currentVignette_${shaderId}`] * 100).toFixed(1) + "%";
                temperatureDiv.style.display = "grid";
                temperatureSlider.value = window[`currentTemperature_${shaderId}`] || 0.0;
                temperatureValue.innerHTML = (window[`currentTemperature_${shaderId}`] * 100).toFixed(1) + "%";
            }
        });

        checkbox.onchange = () => {
            // Check if shaders are already injected
            chrome.scripting.executeScript({
                target: { tabId: tab.id },
                func: () => typeof VF_SHADERS !== 'undefined'
            }).then((results) => {
                // Only inject if shaders are not already present
                if (!results[0].result) {
                    return chrome.scripting.executeScript({
                        target: { tabId: tab.id },
                        files: ['shaders.js']
                    });
                }
                return Promise.resolve();
            }).then(() => {
                // Check if shader is already active
                chrome.scripting.executeScript({
                    target: { tabId: tab.id },
                    func: (shaderId) => {
                        const canvas = document.getElementById(shaderId);
                        if (canvas) {
                            return {
                                isActive: true,
                                sharpness: window[`currentSharpness_${shaderId}`] || 1.0
                            };
                        }
                        return { isActive: false, sharpness: 1.0 };
                    },
                    args: [shaderId]
                }).then((results) => {
                    const { isActive, sharpness } = results[0].result;
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
                                        // Store original opacity before making video transparent
                                        const originalOpacity = video.getAttribute('data-original-opacity');
                                        if (originalOpacity !== null) {
                                            video.style.opacity = originalOpacity;
                                            video.removeAttribute('data-original-opacity');
                                        } else {
                                            video.style.opacity = '1';
                                        }
                                        
                                        // Clean up the filter observer
                                        const filterObserver = window[`filterObserver_${shaderId}`];
                                        if (filterObserver) {
                                            filterObserver.disconnect();
                                            delete window[`filterObserver_${shaderId}`];
                                        }
                                        
                                        const videoStyle = getComputedStyle(video);
                                    }
                                    canvas.remove();
                                }
                            },
                            args: [shaderId]
                        });
                        checkbox.checked = false;
                        sharpnessDiv.style.display = "none";
                        vignetteDiv.style.display = "none";
                        temperatureDiv.style.display = "none";
                    } else {
                        // Add shader
                        chrome.scripting.executeScript({
                            target: { tabId: tab.id },
                            func: (videoIndex, shaderId, initialSharpness) => {
                                // Find the video at the specified index
                                const videos = VF_findVideos();
                                if (videoIndex >= videos.length) {
                                    console.error('Video index out of range');
                                    return;
                                }
                                const video = videos[videoIndex];
                                
                                // Create canvas for WebGL rendering
                                const canvas = document.createElement('canvas');
                                canvas.id = shaderId;
                                canvas.width = video.videoWidth;
                                canvas.height = video.videoHeight;
                                
                                // Get video's computed style and position
                                const videoStyle = getComputedStyle(video);
                                const videoRect = video.getBoundingClientRect();
                                
                                // Handle z-index properly
                                const videoZIndex = parseInt(videoStyle.zIndex) || 0;
                                const videoParentZIndex = parseInt(getComputedStyle(video.parentElement).zIndex) || 0;
                                
                                // Place canvas just below the video's z-index, but above the parent's z-index
                                const canvasZIndex = Math.max(videoZIndex - 1, videoParentZIndex + 1);
                                canvas.style.zIndex = canvasZIndex;
                                
                                // Set absolute positioning
                                canvas.style.position = 'absolute';
                                
                                // Apply the video's filter to the canvas
                                canvas.style.filter = video.style.filter;
                                
                                // Insert canvas as a direct child of body
                                document.body.appendChild(canvas);
                                
                                // Make video transparent but keep controls visible
                                // Store original opacity before making video transparent
                                const originalOpacity = video.style.opacity;
                                video.setAttribute('data-original-opacity', originalOpacity);
                                video.style.opacity = '0';
                                
                                // Ensure video stays above canvas
                                video.style.position = videoStyle.position === 'static' ? 'relative' : videoStyle.position;
                                
                                // Create a MutationObserver to watch for filter changes on the video
                                const filterObserver = new MutationObserver((mutations) => {
                                    mutations.forEach((mutation) => {
                                        if (mutation.type === 'attributes' && mutation.attributeName === 'style') {
                                            const newFilter = video.style.filter;
                                            canvas.style.filter = newFilter;
                                        }
                                    });
                                });
                                
                                // Start observing the video's style attribute
                                filterObserver.observe(video, {
                                    attributes: true,
                                    attributeFilter: ['style']
                                });
                                
                                // Store the observer for cleanup
                                window[`filterObserver_${shaderId}`] = filterObserver;
                                
                                // Initialize WebGL
                                const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
                                if (!gl) {
                                    console.error('WebGL not supported');
                                    return;
                                }
                                
                                // Create shader program
                                const vertexShader = gl.createShader(gl.VERTEX_SHADER);
                                gl.shaderSource(vertexShader, VF_SHADERS.vertex);
                                gl.compileShader(vertexShader);
                                
                                const fragmentShader = gl.createShader(gl.FRAGMENT_SHADER);
                                // Use sharpen shader by default
                                gl.shaderSource(fragmentShader, VF_SHADERS.fragment);
                                gl.compileShader(fragmentShader);
                                
                                const program = gl.createProgram();
                                gl.attachShader(program, vertexShader);
                                gl.attachShader(program, fragmentShader);
                                gl.linkProgram(program);
                                gl.useProgram(program);
                                
                                // Check for compilation/linking errors
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
                                
                                // Create a buffer for the position (two triangles forming a rectangle)
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
                                
                                // Create a buffer for the texture coordinates - FIXED to flip vertically
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
                                
                                // Set up texture
                                const texture = gl.createTexture();
                                gl.bindTexture(gl.TEXTURE_2D, texture);
                                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
                                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
                                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
                                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
                                
                                // Look up uniforms and attributes
                                const positionLocation = gl.getAttribLocation(program, "a_position");
                                const texCoordLocation = gl.getAttribLocation(program, "a_texCoord");
                                const textureSizeLocation = gl.getUniformLocation(program, "u_textureSize");
                                const sharpnessLocation = gl.getUniformLocation(program, "u_sharpness");
                                const vignetteLocation = gl.getUniformLocation(program, "u_strength");
                                const temperatureLocation = gl.getUniformLocation(program, "u_temperature");
                                const textureLocation = gl.getUniformLocation(program, "u_texture");
                                
                                // Set up attributes
                                gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
                                gl.enableVertexAttribArray(positionLocation);
                                gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);
                                
                                gl.bindBuffer(gl.ARRAY_BUFFER, texCoordBuffer);
                                gl.enableVertexAttribArray(texCoordLocation);
                                gl.vertexAttribPointer(texCoordLocation, 2, gl.FLOAT, false, 0, 0);
                                
                                // Set initial values
                                gl.uniform1f(sharpnessLocation, initialSharpness);
                                gl.uniform1f(vignetteLocation, 0.0);
                                gl.uniform1f(temperatureLocation, 0.0);
                                
                                // Store the current values
                                let currentSharpness = initialSharpness;
                                let currentVignette = 0.0;
                                let currentTemperature = 0.0;
                                window[`currentSharpness_${shaderId}`] = currentSharpness;
                                window[`currentVignette_${shaderId}`] = currentVignette;
                                window[`currentTemperature_${shaderId}`] = currentTemperature;
                                
                                // Function to update canvas position
                                const updateCanvasPosition = () => {
                                    const videoRect = video.getBoundingClientRect();
                                    const scrollX = window.scrollX || window.pageXOffset;
                                    const scrollY = window.scrollY || window.pageYOffset;
                                    
                                    // Set canvas position to match video exactly
                                    canvas.style.left = (videoRect.left + scrollX) + 'px';
                                    canvas.style.top = (videoRect.top + scrollY) + 'px';
                                    canvas.style.width = videoRect.width + 'px';
                                    canvas.style.height = videoRect.height + 'px';
                                    
                                    // Update WebGL viewport and canvas dimensions
                                    canvas.width = video.videoWidth;
                                    canvas.height = video.videoHeight;
                                    gl.viewport(0, 0, canvas.width, canvas.height);
                                };
                                
                                // Update position immediately
                                updateCanvasPosition();
                                
                                // Update canvas position on resize and scroll
                                const resizeObserver = new ResizeObserver(updateCanvasPosition);
                                resizeObserver.observe(video);
                                
                                // Add scroll listener to update position
                                window.addEventListener('scroll', updateCanvasPosition, { passive: true });
                                
                                // Render loop
                                function render() {
                                    // Update texture with new video frame
                                    gl.bindTexture(gl.TEXTURE_2D, texture);
                                    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);
                                    
                                    // Set the texture size
                                    gl.uniform2f(textureSizeLocation, video.videoWidth, video.videoHeight);
                                    
                                    // Set the texture uniform
                                    gl.uniform1i(textureLocation, 0);
                                    
                                    // Set the effect uniforms
                                    gl.uniform1f(sharpnessLocation, currentSharpness);
                                    gl.uniform1f(vignetteLocation, currentVignette);
                                    gl.uniform1f(temperatureLocation, currentTemperature);
                                    
                                    // Clear and draw
                                    gl.viewport(0, 0, canvas.width, canvas.height);
                                    gl.clearColor(0, 0, 0, 0);
                                    gl.clear(gl.COLOR_BUFFER_BIT);
                                    gl.drawArrays(gl.TRIANGLES, 0, 6);
                                    
                                    // Continue loop
                                    video.requestVideoFrameCallback(render);
                                }
                                
                                // Start rendering
                                render();
                                
                                // Store the update functions for later use
                                window[`updateSharpness_${shaderId}`] = (value) => {
                                    currentSharpness = value;
                                    render();
                                };
                                
                                window[`updateVignette_${shaderId}`] = (value) => {
                                    currentVignette = value;
                                    render();
                                };
                                
                                window[`updateTemperature_${shaderId}`] = (value) => {
                                    currentTemperature = value;
                                    render();
                                };
                            },
                            args: [video.localIndex, shaderId, parseFloat(sharpnessSlider.value)]
                        });
                        checkbox.checked = true;
                        sharpnessDiv.style.display = "grid";
                        vignetteDiv.style.display = "grid";
                        temperatureDiv.style.display = "grid";
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
        // TODO replace regex with a proper parser?
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
