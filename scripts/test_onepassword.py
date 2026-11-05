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

    def test_profile_exposes_only_contact_fields_from_the_registered_identity(self):
        from host import profile_fields
        item={'category':'IDENTITY','fields':[
            {'id':'firstname','label':'first name','type':'STRING','value':'Hanako'},
            {'id':'custom','label':'自宅住所','type':'ADDRESS','value':'〒123-4567 サンプル町'},
            {'id':'notesPlain','label':'email','type':'STRING','purpose':'NOTES','value':'private notes'},
            {'id':'remindera','label':'reminder answer','type':'STRING','value':'private answer'},
            {'id':'other','label':'email','type':'CONCEALED','value':'private credential'}]}
        fields=profile_fields(item)
        self.assertEqual([f['role'] for f in fields], ['given-name','street-address','postal-code'])
        self.assertEqual(fields[-1]['scope'],'home')
        self.assertEqual(fields[-1]['value'],'123-4567')
        self.assertEqual(profile_fields({**item,'category':'LOGIN'}),[])

    def test_scoped_custom_text_contact_fields_are_available_without_exposing_unrelated_text(self):
        from host import profile_fields
        labels = ['仕事用メール','自宅住所','ふりがな','住所1','秘密の質問']
        item = {'category':'IDENTITY','fields':[
            {'id':str(i),'type':'STRING','label':label,'value':'fixture'} for i,label in enumerate(labels)]}
        self.assertEqual([(f['role'],f['scope']) for f in profile_fields(item)],
                         [('email','work'),('street-address','home'),('name-kana',''),('address-line1','')])

    def test_unmarked_lot_is_not_a_postcode(self):
        from host import profile_fields
        item = {'category':'IDENTITY','fields':[{'id':'address','label':'住所','type':'ADDRESS','value':'架空市若葉町123-4567'}]}
        self.assertEqual([f['role'] for f in profile_fields(item)], ['street-address'])
