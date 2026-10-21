"""Synthetic regression cases; run: python -m unittest newspaper_reader.test.test_crop_assist."""
import copy
import tempfile
import unittest
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

from newspaper_reader.core.image_proc import detect_paper_corners, apply_manual_perspective


def paper(size=(900, 700)):
    im = Image.new("RGB", size, "#243244")
    w, h = size
    points = [(w*.18, h*.12), (w*.85, h*.20), (w*.78, h*.88), (w*.12, h*.80)]
    ImageDraw.Draw(im).polygon(points, fill="white")
    return im, np.array(points) / [w-1, h-1]


class DetectionTests(unittest.TestCase):
    def test_small_and_large_images(self):
        for size in [(900, 700), (3200, 2400)]:
            with self.subTest(size=size):
                im, expected = paper(size)
                original = im.tobytes()
                points = detect_paper_corners(im)
                self.assertIsNotNone(points)
                np.testing.assert_allclose(points, expected, atol=.015)
                self.assertEqual(original, im.tobytes())
                out = apply_manual_perspective(im, (np.array(points) * [size[0]-1, size[1]-1]).tolist())
                self.assertGreater(out.width, size[0] * .5)

    def test_blank_and_tiny(self):
        for size in [(800, 600), (10, 10)]:
            self.assertIsNone(detect_paper_corners(Image.new("RGB", size, "white")))

    def test_rotation(self):
        im, _ = paper()
        for angle in (90, 180, 270):
            rotated = im.rotate(angle, expand=True)
            points = detect_paper_corners(rotated)
            self.assertIsNotNone(points)
            self.assertTrue(np.logical_and(np.array(points) >= 0, np.array(points) <= 1).all())
            apply_manual_perspective(rotated, (np.array(points) * (np.array(rotated.size)-1)).tolist())

    def test_diamond_has_four_unique_corners(self):
        im = Image.new("RGB", (800, 800), "black")
        ImageDraw.Draw(im).polygon([(400, 50), (750, 400), (400, 750), (50, 400)], fill="white")
        points = detect_paper_corners(im)
        self.assertIsNotNone(points)
        self.assertEqual(len(set(map(tuple, points))), 4)

    def test_endpoint_is_read_only_and_handles_rotation(self):
        from fastapi.testclient import TestClient
        from newspaper_reader.app import app, JOBS
        with tempfile.TemporaryDirectory() as folder, TestClient(app) as client:
            path = Path(folder) / "paper.png"
            paper()[0].save(path)
            page = {"id": "page", "path": str(path), "rotate": 90}
            JOBS["crop-assist-test"] = {"status": "ready", "pages": [page]}
            before = copy.deepcopy(page)
            original = path.read_bytes()
            try:
                result = client.post("/api/job/crop-assist-test/page/page/detect-corners")
                self.assertEqual(result.status_code, 200)
                self.assertTrue(result.json()["detected"])
                self.assertEqual(before, page)
                self.assertEqual(original, path.read_bytes())
                self.assertEqual(len(list(Path(folder).iterdir())), 1)
                self.assertEqual(client.post("/api/job/crop-assist-test/page/missing/detect-corners").status_code, 404)
            finally:
                JOBS.pop("crop-assist-test", None)


if __name__ == "__main__":
    unittest.main()
