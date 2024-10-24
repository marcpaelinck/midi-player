import { readLittleEndian, signedInt16 } from "../../utils/byte_functions/little_endian.js";
import { IndexedByteArray } from "../../utils/indexed_array.js";
import { Modulator } from "../basic_soundfont/modulator.js";


export class ReadModulator extends Modulator
{
    /**
     * Creates a modulator
     * @param dataArray {IndexedByteArray}
     */
    constructor(dataArray)
    {
        super({
            srcEnum: readLittleEndian(dataArray, 2),
            dest: readLittleEndian(dataArray, 2),
            amt: signedInt16(dataArray[dataArray.currentIndex++], dataArray[dataArray.currentIndex++]),
            secSrcEnum: readLittleEndian(dataArray, 2),
            transform: readLittleEndian(dataArray, 2)
        });
    }
}

/**
 * Reads the modulator read
 * @param modulatorChunk {RiffChunk}
 * @returns {Modulator[]}
 */
export function readModulators(modulatorChunk)
{
    let gens = [];
    while (modulatorChunk.chunkData.length > modulatorChunk.chunkData.currentIndex)
    {
        gens.push(new ReadModulator(modulatorChunk.chunkData));
    }
    return gens;
}