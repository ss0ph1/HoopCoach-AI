import unittest
from unittest.mock import patch, MagicMock
import cv2
import numpy as np
from app.services import dribbling_video_analyzer as analyzer
from app.services.pose_geometry import Point

class DribblingAnalysisTests(unittest.TestCase):
    def points(self):
        names=['nose','left_shoulder','right_shoulder','left_hip','right_hip','left_knee','right_knee','left_ankle','right_ankle']
        p={name:Point(.5,.5,1) for name in names}
        for name,x,y in [('left_shoulder',.4,.25),('right_shoulder',.6,.25),('left_hip',.42,.55),('right_hip',.58,.55),('left_knee',.42,.72),('right_knee',.58,.72),('left_ankle',.42,.95),('right_ankle',.58,.95)]:p[name]=Point(x,y,1)
        return p
    def test_jersey_is_not_a_ball(self):
        frame=np.zeros((200,200,3),np.uint8)
        cv2.rectangle(frame,(80,50),(120,110),(18,118,235),-1)
        p=self.points();hip=Point(.5,.55,1)
        self.assertIsNone(analyzer.detect_ball_height(frame,hip,p))
        cv2.circle(frame,(146,157),7,(18,118,235),-1)
        self.assertEqual(analyzer.detect_ball_height(frame,hip,p),'low')
        p['left_knee'].visibility=0
        self.assertIsNone(analyzer.detect_ball_height(frame,hip,p))
    def test_static_ball_does_not_confirm_dribbling(self):
        frames=[analyzer.DribblingFrameMetrics(130,10,None,.5,'low') for _ in range(10)]
        self.assertEqual(analyzer.summarize_ball_height(frames),'unknown')
        self.assertEqual(analyzer.evaluate_stance_stability(.2).status,'unknown')
        self.assertIsNone(analyzer.estimate_head_down(Point(.5,.4,1),Point(.5,.4,1),Point(.5,.6,1)))
    def test_capture_released_on_rejected_duration(self):
        cap=MagicMock();cap.isOpened.return_value=True
        cap.get.side_effect=lambda key:30 if key==cv2.CAP_PROP_FPS else 330
        with patch.object(analyzer.cv2,'VideoCapture',return_value=cap):
            with self.assertRaisesRegex(ValueError,'10 seconds'):analyzer.analyze_dribbling_video_file('long.mp4')
        cap.release.assert_called_once()
