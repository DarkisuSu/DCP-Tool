import { BinaryDcpDocument, looksLikeBinaryDcp } from "./binary-document.js";
import { TextDcpDocument } from "./text-document.js";

export function parseDcpDocument(arrayBuffer) {
    return looksLikeBinaryDcp(arrayBuffer)
        ? BinaryDcpDocument.fromArrayBuffer(arrayBuffer)
        : TextDcpDocument.fromArrayBuffer(arrayBuffer);
}
