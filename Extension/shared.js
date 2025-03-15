// Shared functions for VideoFilters extension
// All functions are namespaced with VF_ prefix to avoid conflicts

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