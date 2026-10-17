import { readFile } from "node:fs/promises";
import { inflateSync } from "node:zlib";

export function crc32(bytes) {
    let crc = 0xffffffff;
    for (const byte of bytes) {
        crc ^= byte;
        for (let bit = 0; bit < 8; bit++)
            crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
    return (crc ^ 0xffffffff) >>> 0;
}

// Decode the stream as well as its header: truncated/corrupt images must never replace the README.
export function validatePng(bytes) {
    const invalid = () => {
        throw new Error("Invalid or unsupported PNG image");
    };
    if (!bytes.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex")))
        invalid();
    let header,
        ended = false,
        dataEnded = false;
    const data = [];
    for (let offset = 8; offset < bytes.length; ) {
        if (offset + 12 > bytes.length) invalid();
        const length = bytes.readUInt32BE(offset);
        const end = offset + length + 12;
        if (end > bytes.length) invalid();
        const type = bytes.toString("ascii", offset + 4, offset + 8);
        const body = bytes.subarray(offset + 8, end - 4);
        if (
            crc32(bytes.subarray(offset + 4, end - 4)) !==
            bytes.readUInt32BE(end - 4)
        )
            invalid();
        if (!header && type !== "IHDR") invalid();
        if (type === "IHDR") {
            if (header || length !== 13) invalid();
            const width = body.readUInt32BE(0),
                height = body.readUInt32BE(4);
            const depth = body[8],
                color = body[9],
                interlace = body[12];
            const depths = {
                0: [1, 2, 4, 8, 16],
                2: [8, 16],
                3: [1, 2, 4, 8],
                4: [8, 16],
                6: [8, 16],
            };
            if (
                !width ||
                !height ||
                width > 32768 ||
                height > 32768 ||
                !depths[color]?.includes(depth) ||
                body[10] ||
                body[11] ||
                interlace > 1
            )
                invalid();
            header = { width, height, depth, color, interlace };
        } else if (type === "IDAT") {
            if (dataEnded) invalid();
            data.push(body);
        } else {
            if (data.length) dataEnded = true;
            if (type === "IEND") {
                if (length || end !== bytes.length || !data.length) invalid();
                ended = true;
            } else if (!["PLTE", "IHDR"].includes(type) && /^[A-Z]/.test(type))
                invalid();
        }
        offset = end;
    }
    if (!header || !ended) invalid();
    const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[header.color];
    const passes = header.interlace
        ? [
              [0, 0, 8, 8],
              [4, 0, 8, 8],
              [0, 4, 4, 8],
              [2, 0, 4, 4],
              [0, 2, 2, 4],
              [1, 0, 2, 2],
              [0, 1, 1, 2],
          ]
        : [[0, 0, 1, 1]];
    const rows = passes.map(([x, y, dx, dy]) => {
        const width = Math.max(0, Math.ceil((header.width - x) / dx));
        return [
            width ? Math.max(0, Math.ceil((header.height - y) / dy)) : 0,
            1 + Math.ceil((width * channels * header.depth) / 8),
        ];
    });
    const expected = rows.reduce(
        (sum, [height, stride]) => sum + height * stride,
        0,
    );
    if (expected > 512 * 1024 * 1024) invalid();
    let decoded;
    try {
        decoded = inflateSync(Buffer.concat(data), {
            maxOutputLength: expected,
        });
    } catch {
        invalid();
    }
    if (decoded.length !== expected) invalid();
    let offset = 0;
    for (const [height, stride] of rows) {
        for (let row = 0; row < height; row++, offset += stride)
            if (decoded[offset] > 4) invalid();
    }
    return { width: header.width, height: header.height };
}

export async function readPng(path) {
    const bytes = await readFile(path);
    return { bytes, ...validatePng(bytes) };
}
