import io
import pytest
from PIL import Image
from server_reference.schemas import CandidateMeta

from local_app.result_viewer import (
    candidate_caption,
    checkerboard,
    composite_on_background,
    draw_bbox,
    to_png_bytes,
)


class TestCheckerboard:
    def test_dimensions_and_mode(self):
        img = checkerboard((120, 80), tile=16)
        assert img.size == (120, 80)
        assert img.mode == "RGB"

    def test_tile_pattern(self):
        # 32x32 image with tile=16 -> 2x2 grid
        img = checkerboard((32, 32), tile=16)
        pix = img.load()
        # Top-left tile (0, 0)
        c00 = pix[5, 5]
        # Top-right tile (16, 0)
        c10 = pix[20, 5]
        # Bottom-left tile (0, 16)
        c01 = pix[5, 20]
        # Bottom-right tile (16, 16)
        c11 = pix[20, 20]

        assert c00 == c11
        assert c10 == c01
        assert c00 != c10

    def test_invalid_dimensions_raise(self):
        with pytest.raises(ValueError):
            checkerboard((0, 50))
        with pytest.raises(ValueError):
            checkerboard((50, -10))
        with pytest.raises(ValueError):
            checkerboard((50, 50), tile=0)


class TestCompositeOnBackground:
    @pytest.fixture
    def sample_rgba(self):
        # 10x10 RGBA image: left half opaque red (255, 0, 0, 255), right half transparent (0, 0, 0, 0)
        img = Image.new("RGBA", (10, 10), (0, 0, 0, 0))
        for x in range(5):
            for y in range(10):
                img.putpixel((x, y), (255, 0, 0, 255))
        return img

    def test_composite_checker(self, sample_rgba):
        out = composite_on_background(sample_rgba, "checker")
        assert out.size == (10, 10)
        assert out.mode == "RGB"
        # Opaque red should still be pure red
        assert out.getpixel((2, 2)) == (255, 0, 0)

    def test_composite_dark(self, sample_rgba):
        out = composite_on_background(sample_rgba, "dark")
        assert out.mode == "RGB"
        # Transparent part should take dark background (32, 32, 32)
        assert out.getpixel((7, 7)) == (32, 32, 32)
        # Opaque part remains red
        assert out.getpixel((2, 2)) == (255, 0, 0)

    def test_composite_light(self, sample_rgba):
        out = composite_on_background(sample_rgba, "light")
        assert out.mode == "RGB"
        # Transparent part should take light background (245, 245, 245)
        assert out.getpixel((7, 7)) == (245, 245, 245)
        assert out.getpixel((2, 2)) == (255, 0, 0)

    def test_unknown_kind_raises(self, sample_rgba):
        with pytest.raises(ValueError, match="Unknown background kind"):
            composite_on_background(sample_rgba, "blue")


class TestDrawBbox:
    def test_draw_bbox_returns_copy(self):
        orig = Image.new("RGB", (100, 100), color=(255, 255, 255))
        drawn = draw_bbox(orig, (10, 10, 50, 50), color="blue", width=2)

        assert drawn is not orig
        assert drawn.size == orig.size
        # The line on drawn should have the blue color
        assert drawn.getpixel((10, 10)) == (0, 0, 255)
        # Original remains white
        assert orig.getpixel((10, 10)) == (255, 255, 255)

    def test_invalid_xyxy_length(self):
        orig = Image.new("RGB", (50, 50))
        with pytest.raises(ValueError):
            draw_bbox(orig, (1, 2, 3))


class TestCandidateCaption:
    def test_caption_formatting(self):
        cand = CandidateMeta(
            id=0,
            score=0.91234,
            bbox_xyxy_px=[12.3, 45.7, 100.2, 200.8],
            mask_area_px=15400,
            files={},
        )
        caption = candidate_caption(cand)
        assert "Score: 0.912" in caption
        assert "Box: [12, 46, 100, 201]" in caption
        assert "Area: 15,400 px" in caption


class TestToPngBytes:
    def test_png_roundtrip(self):
        img = Image.new("RGBA", (20, 20), color=(100, 150, 200, 255))
        png_bytes = to_png_bytes(img)

        assert png_bytes.startswith(b"\x89PNG\r\n\x1a\n")
        reloaded = Image.open(io.BytesIO(png_bytes))
        assert reloaded.size == (20, 20)
        assert reloaded.getpixel((10, 10)) == (100, 150, 200, 255)
