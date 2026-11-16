import pytest
from local_app.canvas_utils import (
    canvas_rect_to_image_xyxy,
    extract_last_rect,
    fit_display_size,
    norm_cxcywh_to_xyxy,
    xyxy_to_norm_cxcywh,
)


class TestFitDisplaySize:
    def test_landscape_downscale(self):
        # 1600x800 -> fit in 800x600 -> scale = 800/1600 = 0.5 -> 800x400
        disp_w, disp_h, scale = fit_display_size(1600, 800, 800, 600)
        assert disp_w == 800
        assert disp_h == 400
        assert scale == pytest.approx(0.5)

    def test_portrait_downscale(self):
        # 800x1600 -> fit in 800x600 -> scale = 600/1600 = 0.375 -> 300x600
        disp_w, disp_h, scale = fit_display_size(800, 1600, 800, 600)
        assert disp_w == 300
        assert disp_h == 600
        assert scale == pytest.approx(0.375)

    def test_square_fit(self):
        disp_w, disp_h, scale = fit_display_size(1000, 1000, 500, 500)
        assert disp_w == 500
        assert disp_h == 500
        assert scale == pytest.approx(0.5)

    def test_upscale_small_image(self):
        disp_w, disp_h, scale = fit_display_size(100, 50, 400, 400)
        assert disp_w == 400
        assert disp_h == 200
        assert scale == pytest.approx(4.0)

    def test_invalid_dimensions_raise(self):
        with pytest.raises(ValueError):
            fit_display_size(0, 100, 500, 500)
        with pytest.raises(ValueError):
            fit_display_size(100, -10, 500, 500)
        with pytest.raises(ValueError):
            fit_display_size(100, 100, 0, 500)
        with pytest.raises(ValueError):
            fit_display_size(100, 100, 500, -5)


class TestCanvasRectToImageXyxy:
    def test_standard_positive_drag(self):
        # Canvas scale = 0.5, image is 1000x800
        # Rect drawn on canvas at (50, 40) with width 200, height 150
        xyxy = canvas_rect_to_image_xyxy(50, 40, 200, 150, 0.5, 1000, 800)
        assert xyxy == pytest.approx((100.0, 80.0, 500.0, 380.0))

    def test_negative_width_and_height(self):
        # User drags from (250, 190) backwards with w=-200, h=-150
        xyxy = canvas_rect_to_image_xyxy(250, 190, -200, -150, 0.5, 1000, 800)
        assert xyxy == pytest.approx((100.0, 80.0, 500.0, 380.0))

    def test_mixed_negative_direction(self):
        # width negative, height positive
        xyxy = canvas_rect_to_image_xyxy(300, 100, -100, 200, 1.0, 1000, 1000)
        assert xyxy == pytest.approx((200.0, 100.0, 300.0, 300.0))

    def test_clamping_to_image_boundaries(self):
        # User drags partially outside canvas (e.g. left=-50, top=-20, width=500, height=600)
        xyxy = canvas_rect_to_image_xyxy(-50, -20, 500, 600, 0.5, 800, 800)
        # unscaled x1 = -100 -> clamped to 0.0
        # unscaled x2 = 450 / 0.5 = 900 -> clamped to 800.0
        assert xyxy[0] == pytest.approx(0.0)
        assert xyxy[1] == pytest.approx(0.0)
        assert xyxy[2] == pytest.approx(800.0)
        assert xyxy[3] == pytest.approx(800.0)

    def test_invalid_parameters_raise(self):
        with pytest.raises(ValueError):
            canvas_rect_to_image_xyxy(10, 10, 50, 50, 0.0, 500, 500)
        with pytest.raises(ValueError):
            canvas_rect_to_image_xyxy(10, 10, 50, 50, -0.5, 500, 500)
        with pytest.raises(ValueError):
            canvas_rect_to_image_xyxy(10, 10, 50, 50, 1.0, 0, 500)


class TestBboxNormalization:
    def test_round_trip(self):
        img_w, img_h = 1200, 900
        original_xyxy = (120.0, 90.0, 600.0, 450.0)

        cxcywh = xyxy_to_norm_cxcywh(original_xyxy, img_w, img_h)
        reconstructed_xyxy = norm_cxcywh_to_xyxy(cxcywh, img_w, img_h)

        assert reconstructed_xyxy == pytest.approx(original_xyxy)

    def test_norm_cxcywh_values(self):
        # 1000x1000 image, box from 100,200 to 500,600
        # width = 400, height = 400 -> nw=0.4, nh=0.4
        # cx = 300/1000 = 0.3, cy = 400/1000 = 0.4
        cxcywh = xyxy_to_norm_cxcywh((100, 200, 500, 600), 1000, 1000)
        assert cxcywh == pytest.approx([0.3, 0.4, 0.4, 0.4])

    def test_zero_area_raises(self):
        with pytest.raises(ValueError, match="Zero-area"):
            xyxy_to_norm_cxcywh((100, 100, 100, 200), 1000, 1000)
        with pytest.raises(ValueError, match="Zero-area"):
            norm_cxcywh_to_xyxy([0.5, 0.5, 0.0, 0.2], 1000, 1000)

    def test_clamping_out_of_bounds(self):
        # Out-of-bounds input coords get clamped
        cxcywh = xyxy_to_norm_cxcywh((-50, -50, 1500, 1500), 1000, 1000)
        assert cxcywh == pytest.approx([0.5, 0.5, 1.0, 1.0])

    def test_invalid_length_raises(self):
        with pytest.raises(ValueError):
            xyxy_to_norm_cxcywh((1, 2, 3), 100, 100)
        with pytest.raises(ValueError):
            norm_cxcywh_to_xyxy((1, 2, 3, 4, 5), 100, 100)


class TestExtractLastRect:
    def test_none_or_empty_input(self):
        assert extract_last_rect(None) is None
        assert extract_last_rect({}) is None
        assert extract_last_rect({"objects": []}) is None

    def test_extract_single_rect(self):
        data = {
            "objects": [
                {
                    "type": "rect",
                    "left": 10.5,
                    "top": 20.0,
                    "width": 100.0,
                    "height": 80.0,
                    "scaleX": 1.0,
                    "scaleY": 1.0,
                }
            ]
        }
        res = extract_last_rect(data)
        assert res == {
            "left": 10.5,
            "top": 20.0,
            "width": 100.0,
            "height": 80.0,
        }

    def test_extract_last_of_multiple_objects(self):
        data = {
            "objects": [
                {"type": "circle", "left": 5, "top": 5, "radius": 10},
                {"type": "rect", "left": 10, "top": 10, "width": 50, "height": 50},
                {"type": "line", "x1": 0, "y1": 0, "x2": 10, "y2": 10},
                {
                    "type": "rect",
                    "left": 40.0,
                    "top": 60.0,
                    "width": 70.0,
                    "height": 90.0,
                    "scaleX": 1.5,
                    "scaleY": 2.0,
                },
            ]
        }
        res = extract_last_rect(data)
        assert res == {
            "left": 40.0,
            "top": 60.0,
            "width": 105.0,  # 70 * 1.5
            "height": 180.0,  # 90 * 2.0
        }

    def test_no_rect_objects(self):
        data = {
            "objects": [
                {"type": "circle", "left": 5, "top": 5, "radius": 10},
            ]
        }
        assert extract_last_rect(data) is None
