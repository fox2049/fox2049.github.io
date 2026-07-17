from pathlib import Path

from fontTools.pens.qu2cuPen import Qu2CuPen
from fontTools.pens.recordingPen import RecordingPen
from fontTools.ttLib import TTCollection


FONT_PATH = Path(r"C:\Windows\Fonts\msyhbd.ttc")
FONT_INDEX = 0
OUTPUT_DIR = Path(__file__).resolve().parents[1] / "glyphs"
GLYPHS = {
    "dong": "东",
    "hua": "华",
    "da": "大",
    "xue": "学",
}

CELL_SIZE = 500
FONT_SIZE = 360
CENTER_X = 250
BASELINE_Y = 365


def number(value):
    rounded = round(value, 2)
    if rounded == int(rounded):
        return str(int(rounded))
    return f"{rounded:.2f}".rstrip("0").rstrip(".")


def point_text(point):
    return f"{number(point[0])} {number(point[1])}"


def transform_point(point, scale, origin_x):
    return origin_x + point[0] * scale, BASELINE_Y - point[1] * scale


def interpolate(start, end, progress):
    return (
        start[0] + (end[0] - start[0]) * progress,
        start[1] + (end[1] - start[1]) * progress,
    )


def point_attribute(point):
    return f"{number(point[0])},{number(point[1])}"


def build_paths(commands, scale, origin_x):
    segments = []
    current = None
    contour_start = None

    for command, raw_points in commands:
        points = [transform_point(point, scale, origin_x) for point in raw_points]

        if command == "moveTo":
            current = points[0]
            contour_start = current
        elif command == "lineTo":
            end = points[0]
            segments.append((
                "cubic",
                current,
                interpolate(current, end, 1 / 3),
                interpolate(current, end, 2 / 3),
                end,
            ))
            current = end
        elif command == "curveTo":
            if current is None or len(points) % 3:
                raise ValueError("Unexpected cubic curve structure")
            for index in range(0, len(points), 3):
                control_a, control_b, end = points[index:index + 3]
                segments.append(("cubic", current, control_a, control_b, end))
                current = end
        elif command == "closePath":
            if current != contour_start:
                segments.append((
                    "cubic",
                    current,
                    interpolate(current, contour_start, 1 / 3),
                    interpolate(current, contour_start, 2 / 3),
                    contour_start,
                ))
            current = contour_start
        elif command == "endPath":
            current = None
            contour_start = None
        else:
            raise ValueError(f"Unsupported path command: {command}")

    return segments


def build_svg(character, font):
    cmap = font.getBestCmap()
    glyph_name = cmap[ord(character)]
    glyph_set = font.getGlyphSet()
    units_per_em = font["head"].unitsPerEm
    advance_width = font["hmtx"][glyph_name][0]
    scale = FONT_SIZE / units_per_em
    origin_x = CENTER_X - advance_width * scale / 2

    recording = RecordingPen()
    cubic_pen = Qu2CuPen(
        recording,
        max_err=units_per_em / 1000,
        all_cubic=True,
    )
    glyph_set[glyph_name].draw(cubic_pen)
    segments = build_paths(recording.value, scale, origin_x)
    outline_markup = []
    handle_markup = []
    control_markup = []

    for index, segment in enumerate(segments):
        _, start, control_a, control_b, end = segment
        segment_id = f"curve-{index}"
        outline_markup.append(
            f'  <path class="glyph-segment cubic-segment" data-segment="{segment_id}" '
            f'data-p0="{point_attribute(start)}" data-c1="{point_attribute(control_a)}" '
            f'data-c2="{point_attribute(control_b)}" data-p3="{point_attribute(end)}" '
            f'd="M{point_text(start)}C{point_text(control_a)} {point_text(control_b)} {point_text(end)}"/>'
        )
        handle_markup.extend((
            f'  <line class="control-handle" data-segment="{segment_id}" data-handle="c1" '
            f'x1="{number(start[0])}" y1="{number(start[1])}" '
            f'x2="{number(control_a[0])}" y2="{number(control_a[1])}"/>',
            f'  <line class="control-handle" data-segment="{segment_id}" data-handle="c2" '
            f'x1="{number(end[0])}" y1="{number(end[1])}" '
            f'x2="{number(control_b[0])}" y2="{number(control_b[1])}"/>',
        ))
        control_markup.extend((
            f'  <circle class="control-point" data-segment="{segment_id}" data-control="c1" '
            f'cx="{number(control_a[0])}" cy="{number(control_a[1])}" r="2.6"/>',
            f'  <circle class="control-point" data-segment="{segment_id}" data-control="c2" '
            f'cx="{number(control_b[0])}" cy="{number(control_b[1])}" r="2.6"/>',
        ))

    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {CELL_SIZE} {CELL_SIZE}" role="img" aria-label="{character}">
  <title>{character}</title>
 <g class="glyph-outline">
{chr(10).join(outline_markup)}
 </g>
 <g class="control-layer">
{chr(10).join(handle_markup)}
{chr(10).join(control_markup)}
 </g>
</svg>
'''


def main():
    collection = TTCollection(FONT_PATH)
    font = collection.fonts[FONT_INDEX]
    OUTPUT_DIR.mkdir(exist_ok=True)

    for filename, character in GLYPHS.items():
        output_path = OUTPUT_DIR / f"{filename}.svg"
        output_path.write_text(build_svg(character, font), encoding="utf-8")
        print(output_path)


if __name__ == "__main__":
    main()
