// Shader sources for video processing
const VF_SHADERS = {
    // Vertex shader for basic 2D rendering
    vertex: `
        attribute vec2 a_position;
        attribute vec2 a_texCoord;
        varying vec2 v_texCoord;
        
        void main() {
            gl_Position = vec4(a_position, 0, 1);
            v_texCoord = a_texCoord;
        }
    `,

    // Combined fragment shader for all effects
    fragment: `
        precision mediump float;
        uniform sampler2D u_texture;
        uniform vec2 u_textureSize;
        uniform float u_sharpness;
        uniform float u_strength;  // vignette strength
        uniform float u_temperature;  // temperature adjustment
        varying vec2 v_texCoord;
        
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
            
            // Apply temperature adjustment
            vec3 tempAdjusted = sharpened.rgb;
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
            float vignette = 1.0 - dist * u_strength * 1.5;
            vignette = clamp(vignette, 0.0, 1.0);
            
            // Combine all effects
            vec3 finalColor = tempAdjusted * vignette;
            
            // Ensure values stay in valid range
            finalColor = clamp(finalColor, 0.0, 1.0);
            
            gl_FragColor = vec4(finalColor, color.a);
        }
    `
};