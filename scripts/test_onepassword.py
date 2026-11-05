from pathlib import Path
import sys
import unittest
from unittest.mock import Mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'native'))
from host import handle

class HostTests(unittest.TestCase):
    def test_lists_only_labels_and_reads_only_registered_id(self):
        read = Mock(return_value='fixture')
        config = {'fields': {'a': {'label': 'Name', 'ref': 'op://Demo/Profile/name'}}}
        self.assertEqual(handle({'op':'list'}, config, read), {'fields':[{'id':'a','label':'Name'}]})
        for request in [{'op':'read','id':'op://Other/item/secret'}, {'op':'read','id':'a','ref':'other'}]:
            self.assertIn('error', handle(request, config, read))
        read.assert_not_called()
        self.assertEqual(handle({'op':'read','id':'a'}, config, read), {'value':'fixture'})
        read.assert_called_once_with('op://Demo/Profile/name')
