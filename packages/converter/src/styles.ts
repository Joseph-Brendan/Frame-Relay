import { StyleBlock } from '@frame-relay/schema';
import { NodeSnapshot, StyleIndex, VariableAliasSnapshot, VariableIndex } from './snapshot.js';
import { ConverterWarning, createWarning } from './warnings.js';
import { rgbaToHex } from './tokens.js';

function getBoundTokenPath(
  alias: VariableAliasSnapshot | VariableAliasSnapshot[] | undefined,
  variables: VariableIndex,
): string | undefined {
  if (!alias) return undefined;
  const single = Array.isArray(alias) ? alias[0] : alias;
  if (single && single.type === 'VARIABLE_ALIAS' && variables[single.id]) {
    return variables[single.id].tokenPath;
  }
  return undefined;
}

export interface ExtractStyleBlockContext {
  componentName: string;
  layerPath: string;
  partName: string;
  variables: VariableIndex;
  styles: StyleIndex;
}

/**
 * Extracts a normalized StyleBlock from a single Figma node snapshot.
 */
export function extractStyleBlock(
  node: NodeSnapshot,
  ctx: ExtractStyleBlockContext,
): { styles: StyleBlock; warnings: ConverterWarning[] } {
  const styles: StyleBlock = {};
  const warnings: ConverterWarning[] = [];

  const addRawWarning = (field: string, details: string, fix: string) => {
    warnings.push(
      createWarning('RAW_VALUE', {
        component: ctx.componentName,
        layerPath: ctx.layerPath,
        nodeId: node.id,
        details,
        fix,
      }),
    );
  };

  // 1. Fills -> background (or color on TEXT nodes)
  if (node.fills && node.fills.length > 0) {
    const visibleFill = node.fills.find((f) => f.visible !== false);
    if (visibleFill) {
      const isText = node.type === 'TEXT';
      const targetProp: 'color' | 'background' = isText ? 'color' : 'background';

      if (visibleFill.type === 'SOLID') {
        // Check if bound to variable
        const fillBound =
          visibleFill.boundVariables?.color ||
          (node.boundVariables?.fills as VariableAliasSnapshot | undefined);

        const tokenPath = getBoundTokenPath(fillBound, ctx.variables);

        if (tokenPath) {
          styles[targetProp] = `{${tokenPath}}`;
        } else if (visibleFill.color) {
          const hex = rgbaToHex(visibleFill.color, visibleFill.opacity ?? 1);
          styles[targetProp] = { raw: hex };
          addRawWarning(
            targetProp,
            `${isText ? 'text' : 'fill'} uses raw hex color ${hex}`,
            `Bind ${targetProp} to a color variable so agents use a token`,
          );
        }
      } else {
        warnings.push(
          createWarning('UNSUPPORTED_PAINT', {
            component: ctx.componentName,
            layerPath: ctx.layerPath,
            nodeId: node.id,
            details: `Fill uses unsupported paint type "${visibleFill.type}" and was skipped`,
            fix: 'Use SOLID fills bound to color variables',
          }),
        );
      }
    }
  }

  // 2. Strokes -> borderColor & borderWidth
  if (node.strokes && node.strokes.length > 0) {
    const visibleStroke = node.strokes.find((s) => s.visible !== false);
    if (visibleStroke && visibleStroke.type === 'SOLID') {
      const strokeBound =
        visibleStroke.boundVariables?.color ||
        (node.boundVariables?.strokes as VariableAliasSnapshot | undefined);

      const tokenPath = getBoundTokenPath(strokeBound, ctx.variables);

      if (tokenPath) {
        styles.borderColor = `{${tokenPath}}`;
      } else if (visibleStroke.color) {
        const hex = rgbaToHex(visibleStroke.color, visibleStroke.opacity ?? 1);
        styles.borderColor = { raw: hex };
        addRawWarning(
          'borderColor',
          `stroke uses raw hex color ${hex}`,
          'Bind stroke to a color variable so agents use a token',
        );
      }

      if (node.strokeWeight !== undefined && node.strokeWeight > 0) {
        const weightBound = node.boundVariables?.strokeWeight as VariableAliasSnapshot | undefined;
        const weightTokenPath = getBoundTokenPath(weightBound, ctx.variables);

        if (weightTokenPath) {
          styles.borderWidth = `{${weightTokenPath}}`;
        } else {
          styles.borderWidth = { raw: `${node.strokeWeight}px` };
          addRawWarning(
            'borderWidth',
            `strokeWeight uses raw value ${node.strokeWeight}px`,
            'Bind borderWidth to a stroke width variable so agents use a token',
          );
        }
      }
    }
  }

  // 3. Corner radius -> borderRadius
  if (node.type !== 'TEXT') {
    const tlBound = node.boundVariables?.topLeftRadius as VariableAliasSnapshot | undefined;
    const trBound = node.boundVariables?.topRightRadius as VariableAliasSnapshot | undefined;
    const brBound = node.boundVariables?.bottomRightRadius as VariableAliasSnapshot | undefined;
    const blBound = node.boundVariables?.bottomLeftRadius as VariableAliasSnapshot | undefined;
    const radiusBound = node.boundVariables?.cornerRadius as VariableAliasSnapshot | undefined;

    // Check if all four corners are bound to the exact same variable
    const allCornersSameAlias =
      tlBound &&
      trBound &&
      brBound &&
      blBound &&
      tlBound.id === trBound.id &&
      trBound.id === brBound.id &&
      brBound.id === blBound.id;

    const cornerRadiusAlias = radiusBound || (allCornersSameAlias ? tlBound : undefined);
    const radiusTokenPath = getBoundTokenPath(cornerRadiusAlias, ctx.variables);

    if (radiusTokenPath) {
      styles.borderRadius = `{${radiusTokenPath}}`;
    } else {
      const tl =
        node.topLeftRadius ??
        (typeof node.cornerRadius === 'number' ? node.cornerRadius : undefined);
      const tr =
        node.topRightRadius ??
        (typeof node.cornerRadius === 'number' ? node.cornerRadius : undefined);
      const br =
        node.bottomRightRadius ??
        (typeof node.cornerRadius === 'number' ? node.cornerRadius : undefined);
      const bl =
        node.bottomLeftRadius ??
        (typeof node.cornerRadius === 'number' ? node.cornerRadius : undefined);

      const hasRadius =
        (tl !== undefined && tl > 0) ||
        (tr !== undefined && tr > 0) ||
        (br !== undefined && br > 0) ||
        (bl !== undefined && bl > 0);

      if (hasRadius) {
        if (tl === tr && tr === br && br === bl && tl !== undefined) {
          styles.borderRadius = { raw: `${tl}px` };
          addRawWarning(
            'borderRadius',
            `borderRadius uses raw value ${tl}px`,
            'Bind corner radius to a radius variable so agents use a token',
          );
        } else {
          const mixedStr = `${tl ?? 0}px ${tr ?? 0}px ${br ?? 0}px ${bl ?? 0}px`;
          styles.borderRadius = { raw: mixedStr };
          warnings.push(
            createWarning('MIXED_RADIUS', {
              component: ctx.componentName,
              layerPath: ctx.layerPath,
              nodeId: node.id,
              details: `Layer uses mixed corner radii (${mixedStr})`,
              fix: 'Use uniform corner radius bound to a radius variable',
            }),
          );
          addRawWarning(
            'borderRadius',
            `borderRadius uses mixed raw values ${mixedStr}`,
            'Bind corner radius to a radius variable so agents use a token',
          );
        }
      }
    }
  }

  // 4. Effects -> boxShadow
  if (node.effectStyleId && ctx.styles[node.effectStyleId]) {
    styles.boxShadow = `{${ctx.styles[node.effectStyleId].tokenPath}}`;
  } else if (node.effects && node.effects.length > 0) {
    const visibleEffects = node.effects.filter((e) => e.visible !== false);
    const shadowParts: string[] = [];

    for (const eff of visibleEffects) {
      if (eff.type === 'DROP_SHADOW' || eff.type === 'INNER_SHADOW') {
        const inset = eff.type === 'INNER_SHADOW' ? 'inset ' : '';
        const x = eff.offset?.x ?? 0;
        const y = eff.offset?.y ?? 0;
        const r = eff.radius ?? 0;
        const s = eff.spread ?? 0;
        const col = eff.color
          ? rgbaToHex({ r: eff.color.r, g: eff.color.g, b: eff.color.b }, eff.color.a ?? 1)
          : 'rgba(0,0,0,0.25)';

        shadowParts.push(`${inset}${x}px ${y}px ${r}px ${s}px ${col}`);
      } else {
        warnings.push(
          createWarning('UNSUPPORTED_EFFECT', {
            component: ctx.componentName,
            layerPath: ctx.layerPath,
            nodeId: node.id,
            details: `Effect uses unsupported type "${eff.type}" and was skipped`,
            fix: 'Use DROP_SHADOW or INNER_SHADOW bound to an effect style',
          }),
        );
      }
    }

    if (shadowParts.length > 0) {
      const shadowStr = shadowParts.join(', ');
      styles.boxShadow = { raw: shadowStr };
      addRawWarning(
        'boxShadow',
        `boxShadow uses raw value "${shadowStr}"`,
        'Bind effects to an effect style so agents use an elevation token',
      );
    }
  }

  // 5. Typography on TEXT nodes
  if (node.type === 'TEXT') {
    if (node.textStyleId && ctx.styles[node.textStyleId]) {
      styles.typography = `{${ctx.styles[node.textStyleId].tokenPath}}`;
    } else if (node.fontSize) {
      const size = node.fontSize;
      const weight = node.fontWeight ?? 400;
      const family = node.fontName?.family ?? 'sans-serif';
      let lh = 'normal';
      if (typeof node.lineHeight === 'object' && node.lineHeight !== null) {
        if (node.lineHeight.unit === 'PIXELS' && node.lineHeight.value) {
          lh = `${node.lineHeight.value}px`;
        } else if (node.lineHeight.unit === 'PERCENT' && node.lineHeight.value) {
          lh = `${node.lineHeight.value}%`;
        }
      } else if (typeof node.lineHeight === 'number') {
        lh = `${node.lineHeight}px`;
      }

      const fontStr = `${weight} ${size}px/${lh} ${family}`;
      styles.typography = { raw: fontStr };
      addRawWarning(
        'typography',
        `text uses raw font size ${size}px`,
        'Bind it to a text style so agents use a token',
      );
    }
  }

  // 6. Opacity
  if (node.opacity !== undefined && node.opacity < 1) {
    const opacityBound = node.boundVariables?.opacity as VariableAliasSnapshot | undefined;
    const tokenPath = getBoundTokenPath(opacityBound, ctx.variables);

    if (tokenPath) {
      styles.opacity = `{${tokenPath}}`;
    } else {
      styles.opacity = { raw: String(node.opacity) };
      addRawWarning(
        'opacity',
        `opacity uses raw value ${node.opacity}`,
        'Bind opacity to a variable or style',
      );
    }
  }

  // 7. Icon size on parts named icon-* or icon
  const isIconPart = ctx.partName.startsWith('icon-') || ctx.partName === 'icon';
  if (isIconPart && node.width !== undefined && node.width > 0) {
    const widthBound = node.boundVariables?.width as VariableAliasSnapshot | undefined;
    const tokenPath = getBoundTokenPath(widthBound, ctx.variables);

    if (tokenPath) {
      styles.iconSize = `{${tokenPath}}`;
    } else {
      styles.iconSize = { raw: `${node.width}px` };
      addRawWarning(
        'iconSize',
        `iconSize uses raw value ${node.width}px`,
        'Bind icon dimension to a size token',
      );
    }
  }

  return { styles, warnings };
}
