#!/usr/bin/env node
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';

const __filename = fileURLToPath(import.meta.url);
const playgroundRoot = resolve(dirname(__filename), '..');

const inputPath = process.argv[2]
  ? resolve(process.cwd(), process.argv[2])
  : resolve(playgroundRoot, 'chess3d', 'chess.fbx');
const outputPath = process.argv[3]
  ? resolve(process.cwd(), process.argv[3])
  : resolve(playgroundRoot, 'chess3d', 'chess-piece-groups.json');

const pieceNameRegex = /(black|white|king|queen|rook|bishop|knight|horse|pawn|castle)/i;

function parseFbx(inputFile) {
  const bytes = readFileSync(inputFile);
  const loader = new FBXLoader();
  const root = loader.parse(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    dirname(inputFile)
  );

  let meshCount = 0;
  root.traverse((node) => {
    if (node.isMesh) {
      meshCount += 1;
    }
  });

  const rootChildren = root.children.map((child, index) => ({
    index,
    name: child.name || `(unnamed_${index})`,
    type: child.type,
    childCount: child.children?.length || 0,
  }));

  const pieceCandidates = rootChildren
    .filter((child) => pieceNameRegex.test(child.name) || child.childCount >= 5)
    .map((child) => {
      const sourceNode = root.children[child.index];
      const descendants = [];
      sourceNode.traverse((node) => {
        if (node === sourceNode) {
          return;
        }
        descendants.push({
          name: node.name || '(unnamed)',
          type: node.type,
          childCount: node.children?.length || 0,
        });
      });

      return {
        ...child,
        descendants,
      };
    });

  return {
    format: 'fbx',
    meshCount,
    warning:
      meshCount === 0
        ? 'FBX contains no triangulated Mesh nodes for FBXLoader; file appears to be NURBS/group data only.'
        : null,
    summary: {
      totalRootChildren: rootChildren.length,
      extractedCandidates: pieceCandidates.length,
    },
    rootChildren,
    pieceCandidates,
  };
}

function parseMayaAscii(inputFile) {
  const text = readFileSync(inputFile, 'utf8');
  const lines = text.split(/\r?\n/);

  const nodeRegex = /^createNode\s+(\w+)\s+(?:-\w+\s+)*-n\s+"([^"]+)"(?:\s+-p\s+"([^"]+)")?;/;
  const nodes = [];
  const byName = new Map();
  const childrenByParent = new Map();
  const typeCounts = new Map();

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const match = line.match(nodeRegex);
    if (!match) {
      continue;
    }
    const [, type, name, parent = null] = match;
    const node = {
      line: index + 1,
      type,
      name,
      parent,
    };
    nodes.push(node);
    byName.set(name, node);
    typeCounts.set(type, (typeCounts.get(type) || 0) + 1);
    if (parent) {
      if (!childrenByParent.has(parent)) {
        childrenByParent.set(parent, []);
      }
      childrenByParent.get(parent).push(name);
    }
  }

  const meshCount = typeCounts.get('mesh') || 0;
  const nurbsSurfaceCount = typeCounts.get('nurbsSurface') || 0;

  const pieceCandidates = nodes
    .filter((node) => node.type === 'transform')
    .map((node) => {
      const childNames = childrenByParent.get(node.name) || [];
      return {
        name: node.name,
        line: node.line,
        type: node.type,
        childCount: childNames.length,
        childTypes: childNames.map((childName) => byName.get(childName)?.type || 'unknown'),
      };
    })
    .filter((node) => pieceNameRegex.test(node.name) || node.childCount >= 5);

  return {
    format: 'ma',
    meshCount,
    nurbsSurfaceCount,
    warning:
      meshCount === 0
        ? 'Maya ASCII scene contains no polygon mesh nodes (`createNode mesh`); geometry appears NURBS/procedural only.'
        : null,
    summary: {
      totalNodes: nodes.length,
      totalTransforms: typeCounts.get('transform') || 0,
      extractedCandidates: pieceCandidates.length,
    },
    typeCounts: Object.fromEntries([...typeCounts.entries()].sort((a, b) => a[0].localeCompare(b[0]))),
    pieceCandidates,
  };
}

function parseMayaBinary(inputFile) {
  return {
    format: 'mb',
    meshCount: null,
    warning:
      'Maya Binary (.mb) is not parseable with Three.js loaders in Node. Open in Maya/Blender and export to GLB/OBJ or Maya ASCII (.ma) with polygon meshes.',
    summary: {
      parsed: false,
    },
    pieceCandidates: [],
  };
}

function buildReport(inputFile, outputFile) {
  const extension = extname(inputFile).toLowerCase();
  let parsed;
  if (extension === '.fbx') {
    parsed = parseFbx(inputFile);
  } else if (extension === '.ma') {
    parsed = parseMayaAscii(inputFile);
  } else if (extension === '.mb') {
    parsed = parseMayaBinary(inputFile);
  } else {
    throw new Error(`Unsupported extension: ${extension}`);
  }

  return {
    inputPath: inputFile,
    outputPath: outputFile,
    ...parsed,
  };
}

const report = buildReport(inputPath, outputPath);

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, JSON.stringify(report, null, 2), 'utf8');

console.log(`Parsed ${report.format.toUpperCase()}: ${inputPath}`);
if (report.meshCount !== null && report.meshCount !== undefined) {
  console.log(`Mesh nodes: ${report.meshCount}`);
}
if (report.nurbsSurfaceCount !== undefined) {
  console.log(`NURBS surfaces: ${report.nurbsSurfaceCount}`);
}
console.log(`Candidate piece groups: ${report.pieceCandidates.length}`);
console.log(`Wrote manifest: ${outputPath}`);
if (report.warning) {
  console.warn(report.warning);
}
