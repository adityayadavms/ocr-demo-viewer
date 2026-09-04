/**
 * RootDrishti action contract for Gemini structured output.
 *
 * Field names here are law — the frontend mirror
 * `frontend/src/features/rootdrishti/agentActions.js` must stay in sync.
 * Keep object property keys alphabetical where Gemini cares about ordering.
 *
 * Geometry (x, y, w, h) lives ONLY inside props. Top-level x/y/w/h were removed
 * because dual locations made Gemini scatter fields and loop.
 */
import { Type } from '@google/genai';

/** Ordered list of action types (must match frontend AGENT_ACTION_TYPES). */
export const AGENT_ACTION_TYPES = [
    'add_todo',
    'align_shapes',
    'bring_to_front',
    'create_shape',
    'delete_shape',
    'distribute_shapes',
    'label_shape',
    'move_shape',
    'pen',
    'place_shape',
    'resize_shape',
    'review',
    'rotate_shapes',
    'send_to_back',
    'set_my_view',
    'stack_shapes',
    'think',
    'update_shape',
];

const ActionSchema = {
    type: Type.OBJECT,
    properties: {
        axis: { type: Type.STRING, enum: ['x', 'y'] },
        closed: { type: Type.BOOLEAN },
        gap: { type: Type.NUMBER },
        intent: { type: Type.STRING },
        logicalId: { type: Type.STRING },
        mode: { type: Type.STRING, enum: ['start', 'center', 'end'] },
        points: {
            type: Type.ARRAY,
            items: {
                type: Type.OBJECT,
                properties: {
                    x: { type: Type.NUMBER },
                    y: { type: Type.NUMBER },
                },
            },
        },
        props: {
            type: Type.OBJECT,
            properties: {
                color: { type: Type.STRING },
                endShapeId: { type: Type.STRING },
                fill: { type: Type.STRING },
                geo: { type: Type.STRING },
                h: { type: Type.NUMBER },
                startShapeId: { type: Type.STRING },
                text: { type: Type.STRING },
                w: { type: Type.NUMBER },
                x: { type: Type.NUMBER },
                y: { type: Type.NUMBER },
            },
        },
        rotation: { type: Type.NUMBER },
        scale: { type: Type.NUMBER },
        shapeId: { type: Type.STRING },
        shapeIds: { type: Type.ARRAY, items: { type: Type.STRING } },
        shapeType: {
            type: Type.STRING,
            enum: ['rectangle', 'ellipse', 'diamond', 'triangle', 'text', 'arrow', 'line', 'circle'],
        },
        side: { type: Type.STRING, enum: ['top', 'bottom', 'left', 'right'] },
        smooth: { type: Type.BOOLEAN },
        style: { type: Type.STRING, enum: ['smooth', 'straight'] },
        text: { type: Type.STRING },
        type: {
            type: Type.STRING,
            enum: AGENT_ACTION_TYPES,
        },
    },
    required: ['type'],
};

export const AGENT_RESPONSE_SCHEMA = {
    type: Type.OBJECT,
    properties: {
        actions: { type: Type.ARRAY, items: ActionSchema },
        message: { type: Type.STRING },
    },
    required: ['message', 'actions'],
};

/** Appended to the system prompt so the model knows each tool. */
export const AGENT_TOOL_REFERENCE = `
### Tool calls (put them in actions[])
All geometry goes in props: props.x, props.y, props.w, props.h. Never put x/y/w/h at the top level.
- create_shape: draw. Fields: logicalId, shapeType (rectangle|ellipse|circle|diamond|triangle|text|arrow|line), props{x,y,w,h,color,text,geo,startShapeId,endShapeId}, intent
- update_shape: change. Fields: shapeId, props{x,y,w,h,color,fill,geo,text}, intent
- delete_shape: remove. Fields: shapeId, intent
- label_shape: set text on a shape. Fields: shapeId, text, intent
- move_shape: move. Fields: shapeId, props{x,y}, intent
- align_shapes: Fields: shapeIds[] (or omit / use ["selection"] for current selection; needs ≥2), axis('x'|'y'), mode('start'|'center'|'end'), intent
- distribute_shapes: Fields: shapeIds[] (or omit / use ["selection"] for current selection; needs ≥3 shapes), axis('x'|'y'), intent
- pen: freehand stroke. Fields: points[{x,y}], color?, closed?, style('smooth'|'straight'), intent
- rotate_shapes: Fields: shapeIds[] (or selection), rotation (radians), intent
- resize_shape: Fields: shapeId, scale (e.g. 1.25) OR props{w,h}, intent
- stack_shapes: Fields: shapeIds[] (or selection; needs ≥2), axis('x'|'y'), gap?, intent
- bring_to_front / send_to_back: Fields: shapeIds[] (or selection), intent
- place_shape: put shapeId beside another. Fields: shapeId, besideShapeId (via props.startShapeId), side(top|bottom|left|right), gap?, intent
- set_my_view: move camera. Fields: props{x,y,w,h}, intent
- think: short internal note for the teacher transcript. Fields: text, intent
- review: self-check; may trigger a follow-up. Fields: text (what to verify), intent
- add_todo: queue a follow-up task. Fields: text, intent
- Teacher reply lives in the top-level "message" string. Do not emit a message action.

### CRITICAL execution rules
- Emit at most 12 actions per reply. Never repeat an identical shape. If a diagram needs more, stop at 12 and summarize the rest in message. Pen strokes: ≤ 30 points.
- Every flowchart / process box MUST have unique non-empty props.text (the label). Do not emit unlabeled rectangles. Do not increment y to "fill" the canvas. If you notice you are repeating create_shape, STOP immediately.
- If the user asks to draw / create / add / make / delete / move / label / align / distribute / connect / sketch / rotate / resize / stack — you MUST put matching entries in actions[]. Do NOT only describe the work in "message".
- "message" = short confirmation (1-2 sentences). Real canvas work lives in actions[].
- Put a short "intent" on every action (e.g. "draw process box", "align selected cards") so the teacher can read the transcript.
- create_shape MUST include shapeType and props.x / props.y / props.w / props.h. Place new shapes near the given viewport center, spaced 160-200 apart.
- Every create_shape needs a unique logicalId (step1, boxA, …). Arrows use startShapeId/endShapeId = those logicalIds (or real shapeId from context).
- update / delete / label / move MUST use real shapeId strings from Canvas shapes (e.g. "shape:…").
- For "align these" / "distribute these", omit shapeIds or use ["selection"] when the teacher has shapes selected.
- color: black|blue|green|red|orange|violet|grey|yellow
- geo: rectangle|ellipse|diamond|triangle (circle is an alias for ellipse)
`.trim();
