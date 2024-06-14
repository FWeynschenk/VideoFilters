# VideoFilters
Chrome extension for 
* manipulating style.filters on html5 video tags.
* video playbackRate
* Button per video for requesting Picture in Picture mode

![image](https://github.com/FWeynschenk/VideoFilters/assets/33690654/de4767cf-17f1-4a7e-80c8-4b0a1833c0c9)


## Changelog
### 1.3.0
* ability to play videos in a [document pip](https://developer.mozilla.org/en-US/docs/Web/API/Document_Picture-in-Picture_AP). That does support styling, and thus supports brightness etc. like you'd expect.
### 1.2.3
* fixed an issue where the picture in picture(pip) button didn't work for videos inside a [ShadowRoot](https://developer.mozilla.org/en-US/docs/Web/API/ShadowRoot)
* pip button disregards videos' disable pip request. I.e. Disney+ can now be played in pip mode.
### 1.2.2
* fixed an issue where videos inside a [ShadowRoot](https://developer.mozilla.org/en-US/docs/Web/API/ShadowRoot) are not found, most notably Disney+
* fixed settings not carrying over after an extension update
### 1.2.1
* removal of dangling button
### 1.2.0
* presets
### 1.1.0
* added Picture in Picture toggle.
* fixed rounding errors in the displaying of percentages.
### 1.0.0
* initial version
