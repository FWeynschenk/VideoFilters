const defaultShaderFragment = `
    precision mediump float;
    uniform sampler2D u_texture;
    uniform vec2 u_textureSize;
    varying vec2 v_texCoord;

    uniform float u_sharpness;  // [min: 0, max: 3, default: 0, label: Sharpness]
    uniform float u_vignette;  // [min: 0, max: 2, default: 0, label: Vignette]
    uniform float u_temperature;  // [min: -2, max: 2, default: 0, label: Temperature]
    uniform float u_chromaticAberration;  // [min: 0, max: 2, default: 0, label: Chromatic Aberration]
    uniform float u_edgeDetection;  // [min: 0, max: 1, default: 0, label: Edge Detection]

    // Sobel edge detection function
    vec4 sobel(vec2 uv, vec2 pixelSize) {
        vec4 topLeft = texture2D(u_texture, uv + vec2(-pixelSize.x, -pixelSize.y));
        vec4 top = texture2D(u_texture, uv + vec2(0.0, -pixelSize.y));
        vec4 topRight = texture2D(u_texture, uv + vec2(pixelSize.x, -pixelSize.y));
        vec4 left = texture2D(u_texture, uv + vec2(-pixelSize.x, 0.0));
        vec4 right = texture2D(u_texture, uv + vec2(pixelSize.x, 0.0));
        vec4 bottomLeft = texture2D(u_texture, uv + vec2(-pixelSize.x, pixelSize.y));
        vec4 bottom = texture2D(u_texture, uv + vec2(0.0, pixelSize.y));
        vec4 bottomRight = texture2D(u_texture, uv + vec2(pixelSize.x, pixelSize.y));

        vec2 sobelX = vec2(
            -1.0 * topLeft.r + 1.0 * topRight.r +
            -2.0 * left.r + 2.0 * right.r +
            -1.0 * bottomLeft.r + 1.0 * bottomRight.r,
            -1.0 * topLeft.g + 1.0 * topRight.g +
            -2.0 * left.g + 2.0 * right.g +
            -1.0 * bottomLeft.g + 1.0 * bottomRight.g
        );

        vec2 sobelY = vec2(
            -1.0 * topLeft.r - 2.0 * top.r - 1.0 * topRight.r +
            1.0 * bottomLeft.r + 2.0 * bottom.r + 1.0 * bottomRight.r,
            -1.0 * topLeft.g - 2.0 * top.g - 1.0 * topRight.g +
            1.0 * bottomLeft.g + 2.0 * bottom.g + 1.0 * bottomRight.g
        );

        float edgeStrength = length(vec2(sobelX.x, sobelY.x));
        return vec4(vec3(edgeStrength), 1.0);
    }

    void main() {
        vec2 onePixel = vec2(1.0, 1.0) / u_textureSize;

        // Sample neighboring pixels for sharpening
        vec4 color = texture2D(u_texture, v_texCoord);
        vec4 colorLeft = texture2D(u_texture, v_texCoord - vec2(onePixel.x, 0.0));
        vec4 colorRight = texture2D(u_texture, v_texCoord + vec2(onePixel.x, 0.0));
        vec4 colorUp = texture2D(u_texture, v_texCoord - vec2(0.0, onePixel.y));
        vec4 colorDown = texture2D(u_texture, v_texCoord + vec2(0.0, onePixel.y));

        // Apply sharpening
        float sharpenCenter = 1.0 + 4.0 * u_sharpness;
        float sides = u_sharpness;
        vec4 sharpened = sharpenCenter * color - sides * (colorLeft + colorRight + colorUp + colorDown);

        // Apply chromatic aberration
        vec2 center = vec2(0.5, 0.5);
        vec2 offset = (v_texCoord - center) * u_chromaticAberration * 0.1;
        
        vec4 chromaticColor;
        chromaticColor.r = texture2D(u_texture, v_texCoord + offset).r;
        chromaticColor.g = texture2D(u_texture, v_texCoord).g;
        chromaticColor.b = texture2D(u_texture, v_texCoord - offset).b;
        chromaticColor.a = color.a;

        // Apply edge detection
        vec4 edgeColor = sobel(v_texCoord, onePixel);
        vec4 blendedColor = mix(chromaticColor, edgeColor, u_edgeDetection);

        // Apply sharpening to the blended result
        vec4 finalSharpened = sharpenCenter * blendedColor - sides * (
            texture2D(u_texture, v_texCoord - vec2(onePixel.x, 0.0)) +
            texture2D(u_texture, v_texCoord + vec2(onePixel.x, 0.0)) +
            texture2D(u_texture, v_texCoord - vec2(0.0, onePixel.y)) +
            texture2D(u_texture, v_texCoord + vec2(0.0, onePixel.y))
        );

        // Apply temperature adjustment
        vec3 tempAdjusted = finalSharpened.rgb;
        if (u_temperature > 0.0) {
            // Warm
            tempAdjusted.r = tempAdjusted.r + (tempAdjusted.r * u_temperature * 0.2);
            tempAdjusted.b = tempAdjusted.b - (tempAdjusted.b * u_temperature * 0.1);
        } else {
            // Cool
            float coolness = -u_temperature;
            tempAdjusted.b = tempAdjusted.b + (tempAdjusted.b * coolness * 0.2);
            tempAdjusted.r = tempAdjusted.r - (tempAdjusted.r * coolness * 0.1);
        }

        // Apply vignette
        vec2 vignetteCenter = vec2(0.5, 0.5);
        float dist = length(v_texCoord - vignetteCenter);
        float vignette = 1.0 - dist * u_vignette * 1.5;
        vignette = clamp(vignette, 0.0, 1.0);

        // Combine all effects
        vec3 finalColor = tempAdjusted * vignette;

        // Ensure values stay in valid range
        finalColor = clamp(finalColor, 0.0, 1.0);

        gl_FragColor = vec4(finalColor, color.a);
    }
`; 