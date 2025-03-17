/**
 * Parses shader fragment code to extract uniform properties defined in comments
 * @param {string} fragmentShader - The fragment shader code
 * @returns {Object} Object containing parsed uniform properties
 */
function parseShaderUniforms(fragmentShader) {
    const uniformRegex = /uniform\s+(\w+)\s+(\w+);\s*\/\/\s*\[(.*?)\]/g;
    const properties = {};
    let match;

    while ((match = uniformRegex.exec(fragmentShader)) !== null) {
        const [_, type, name, comment] = match;
        const propertyString = comment.trim();
        
        // Parse the property string into an object
        const propertyObj = {};
        propertyString.split(',').forEach(prop => {
            const [key, value] = prop.split(':').map(s => s.trim());
            // Convert string values to appropriate types
            if (value === 'true' || value === 'false') {
                propertyObj[key] = value === 'true';
            } else if (!isNaN(value)) {
                propertyObj[key] = Number(value);
            } else {
                propertyObj[key] = value;
            }
        });

        properties[name] = {
            type,
            ...propertyObj
        };
    }
    return properties;
}

