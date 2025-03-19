// Shared functions for VideoFilters extension

function VF_findVideos() {
    let nodes = Array.from(document.querySelectorAll("video, .VF_standin")) ?? [];
    for (const { shadowRoot } of document.querySelectorAll("*")) {
        if (shadowRoot) {
            nodes = nodes.concat(Array.from(shadowRoot.querySelectorAll("video, .VF_standin")) ?? []);
        }
    }
    return nodes;
}

function VF_insertAt(parent, newElement, index) {
    if (index >= parent.children.length) {
        parent.appendChild(newElement);
    } else {
        parent.insertBefore(newElement, parent.children[index]);
    }
}

function VF_getElementIndex(element) {
    return Array.prototype.slice.call(element.parentNode.children).indexOf(element);
}

function VF_clearDocPIP() {
    document.VF_vidContRef.append(document.VF_vidRef);
    document.VF_vidRef.style.width = document.VF_vidWidth ? document.VF_vidWidth : "";
    document.VF_vidRef.style.height = document.VF_vidHeight ? document.VF_vidHeight : "";
    VF_insertAt(document.VF_vidContRef, document.VF_vidRef, document.VF_vidIndex);
    if(document.VF_addedControls) {
        document.VF_vidRef.removeAttribute("controls");
    }
    document.pipWindow.close();
    document.VF_pipIndex = null;
    document.VF_vidRef = null;
    document.VF_vidContRef = null;
    document.VF_vidIndex = null;
    document.VF_vidWidth = null;
    document.VF_vidHeight = null;
    document.VF_standinEl.remove();
} 

/**
 * Detects all elements that overlap with a reference element and categorizes them
 * as either in front of or behind the reference element in the stacking order.
 *
 * @param {HTMLElement} referenceElement - The reference element to check against
 * @returns {Object} - Object containing two arrays: elementsInFront and elementsBehind
 */
function VF_detectOverlappingElements(referenceElement) {
    // Get reference element's position and dimensions
    const refRect = referenceElement.getBoundingClientRect();
    
    // Initialize result arrays
    const elementsInFront = [];
    const elementsBehind = [];
    
    // Get all elements in the document
    const allElements = document.querySelectorAll('*');
    
    // Loop through all elements to find those that overlap
    allElements.forEach(element => {
      // Skip the reference element itself and non-visible elements
      if (element === referenceElement || 
          getComputedStyle(element).display === 'none' || 
          getComputedStyle(element).visibility === 'hidden') {
        return;
      }
      
      // Check if elements overlap geometrically
      const elemRect = element.getBoundingClientRect();
      const overlaps = !(
        refRect.right < elemRect.left || 
        refRect.left > elemRect.right || 
        refRect.bottom < elemRect.top || 
        refRect.top > elemRect.bottom
      );
      
      if (!overlaps) {
        return;
      }
      
      // Determine if element is in front of or behind the reference
      if (VF_isInFrontOf(element, referenceElement)) {
        elementsInFront.push(element);
      } else {
        elementsBehind.push(element);
      }
    });
    
    return {
      elementsInFront,
      elementsBehind
    };
  }
  
  /**
   * Determines if elementA is visually in front of elementB
   * based on stacking context and z-index
   * 
   * @param {HTMLElement} elementA - The element to check
   * @param {HTMLElement} elementB - The reference element
   * @returns {boolean} - True if elementA is in front of elementB
   */
  function VF_isInFrontOf(elementA, elementB) {
    // Get stacking contexts
    const stackA = VF_getStackingContext(elementA);
    const stackB = VF_getStackingContext(elementB);
    
    // Find common ancestor stacking context
    let commonAncestorIndex = 0;
    const minLength = Math.min(stackA.length, stackB.length);
    
    while (commonAncestorIndex < minLength && 
           stackA[commonAncestorIndex] === stackB[commonAncestorIndex]) {
      commonAncestorIndex++;
    }
    
    // If one is completely contained in the other
    if (commonAncestorIndex === minLength) {
      // If B's stack is longer, it's a descendant of A's context
      if (stackB.length > stackA.length) {
        return false;
      }
      // If A's stack is longer, it's a descendant of B's context
      if (stackA.length > stackB.length) {
        return true;
      }
      // They're the same element (shouldn't happen due to earlier check)
      return false;
    }
    
    // Compare z-indices at the diverging point
    const elementAContext = stackA[commonAncestorIndex];
    const elementBContext = stackB[commonAncestorIndex];
    
    const zIndexA = getComputedStyle(elementAContext).zIndex;
    const zIndexB = getComputedStyle(elementBContext).zIndex;
    
    // Handle 'auto' z-index (treat as 0)
    const zValueA = zIndexA === 'auto' ? 0 : parseInt(zIndexA, 10);
    const zValueB = zIndexB === 'auto' ? 0 : parseInt(zIndexB, 10);
    
    // Higher z-index means in front
    if (zValueA !== zValueB) {
      return zValueA > zValueB;
    }
    
    // If z-indices are equal, DOM order determines stacking
    // Get all children of the common parent
    const commonParent = stackA[commonAncestorIndex - 1] || document.documentElement;
    const children = Array.from(commonParent.children);
    
    // Later in the DOM means in front of earlier elements
    return children.indexOf(elementAContext) > children.indexOf(elementBContext);
  }
  
  /**
   * Gets the stacking context hierarchy for an element
   * 
   * @param {HTMLElement} element - The element to check
   * @returns {Array} - Array of elements representing the stacking context hierarchy
   */
  function VF_getStackingContext(element) {
    const stack = [];
    let current = element;
    
    while (current && current !== document.documentElement) {
      stack.unshift(current);
      current = current.parentElement;
    }
    
    // Add document element at the root
    stack.unshift(document.documentElement);
    
    return stack;
  }
  
  // Example usage:
  // const referenceElement = document.getElementById('myElement');
  // const result = detectOverlappingElements(referenceElement);
  // console.log('Elements in front:', result.elementsInFront);
  // console.log('Elements behind:', result.elementsBehind);

// TODO thoughts
// get complete stacking context add 1 z for each element above target and -1 for each element below target
// OR
// just put it on top and give it its own controls(see https://claude.ai/chat/e7dc8d12-f020-4c01-985e-22303eda01b6)
