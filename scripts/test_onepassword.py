from pathlib import Path
import sys
import unittest
from unittest.mock import Mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'native'))
from host import handle

class HostTests(unittest.TestCase):
    def test_multiple_identities_list_metadata_and_read_only_the_chosen_registration(self):
        config={'profiles':{'a':{'label':'Personal','vault':'v1','item':'i1'},
                            'b':{'label':'Work','vault':'v2','item':'i2'}}}
        read_item=Mock(return_value={'category':'IDENTITY','fields':[
            {'id':'firstname','type':'STRING','label':'first name','value':'Fixture'}]})
        self.assertEqual(handle({'op':'list'},config,Mock(),read_item),
                         {'profiles':[{'id':'a','label':'Personal'},{'id':'b','label':'Work'}]})
        for request in [{'op':'profile'},{'op':'profile','id':'other'}, {'op':'profile','id':'b','item':'i1'}]:
            self.assertIn('error',handle(request,config,Mock(),read_item))
        read_item.assert_not_called()
        self.assertEqual(handle({'op':'profile','id':'b'},config,Mock(),read_item)['fields'][0]['value'],'Fixture')
        read_item.assert_called_once_with('v2','i2')

    def test_installer_selects_multiple_identities_without_reading_their_values(self):
        import install, json, tempfile
        from unittest.mock import patch
        identities=[{'id':letter*26,'title':name,'vault':{'id':'v'*26,'name':'Demo'}}
                    for letter,name in [('a','Personal'),('b','Work')]]
        with tempfile.TemporaryDirectory() as folder:
            args=['install.py','a'*32,'--choose','Demo','--chrome-data',folder]
            with patch.object(sys,'argv',args),patch.object(sys,'platform','darwin'), \
                 patch.object(install.shutil,'which',return_value='/fixture/op'), \
                 patch.object(install,'run_op',return_value=json.dumps(identities),create=True) as op, \
                 patch.object(install,'select_python',return_value='/usr/bin/python3',create=True), \
                 patch('builtins.input',return_value='1,2'),patch('builtins.print'):
                install.main()
            config=json.loads((Path(folder)/'NativeMessagingHosts'/install.HOST/'fields.json').read_text())
            self.assertEqual([p['item'] for p in config['profiles'].values()],['a'*26,'b'*26])
            self.assertEqual(op.call_args.args[1:3],('item','list'))
            launcher=(Path(folder)/'NativeMessagingHosts'/install.HOST/'host.py').read_text()
            self.assertTrue(launcher.startswith('#!/usr/bin/python3\n'))

    def test_installer_invalid_identity_does_not_overwrite_an_existing_registration(self):
        import install, tempfile
        from unittest.mock import patch
        with tempfile.TemporaryDirectory() as folder:
            path=Path(folder)/'NativeMessagingHosts'/install.HOST/'fields.json'
            path.parent.mkdir(parents=True);path.write_text('{"sentinel":true}')
            args=['install.py','a'*32,'--profile','Demo','b'*26,'--chrome-data',folder]
            with patch.object(sys,'argv',args),patch.object(sys,'platform','darwin'), \
                 patch.object(install.shutil,'which',return_value='/fixture/op'), \
                 patch.object(install,'run_op',return_value='[]',create=True), \
                 patch.object(install,'select_python',return_value='/usr/bin/python3',create=True), \
                 self.assertRaises(SystemExit):install.main()
            self.assertEqual(path.read_text(),'{"sentinel":true}')

    def test_repair_preserves_registrations_and_installed_host_runs_without_the_setup_venv(self):
        import install, tempfile, json, subprocess, struct, shutil
        from unittest.mock import patch
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder);fake_venv=root/'venv';fake_venv.mkdir()
            op=root/'op'
            op.write_text('#!'+sys.executable+'\nimport json\nprint(json.dumps({"category":"IDENTITY","fields":[{"id":"email","type":"EMAIL","label":"Email","value":"fixture@example.test"}]}))\n')
            op.chmod(0o700)
            native=root/'Chrome/NativeMessagingHosts'/install.HOST
            native.mkdir(parents=True)
            registration={'profile':{'vault':'Demo','item':'a'*26}}
            (native/'fields.json').write_text(json.dumps({'origin':'chrome-extension://'+'b'*32+'/',**registration}))
            args=['install.py','a'*32,'--repair','--chrome-data',str(root/'Chrome')]
            with patch.object(sys,'argv',args),patch.object(sys,'platform','darwin'), \
                 patch.object(sys,'executable',str(fake_venv/'python3')), \
                 patch.object(install.shutil,'which',return_value=str(op)),patch('builtins.print'):
                install.main()
            shutil.rmtree(fake_venv)
            config=json.loads((native/'fields.json').read_text())
            self.assertEqual(config['profile'],registration['profile'])
            body=json.dumps({'op':'profile'}).encode()
            result=subprocess.run([str(native/'host.py'),config['origin']],input=struct.pack('=I',len(body))+body,capture_output=True,check=True)
            length,=struct.unpack('=I',result.stdout[:4]);self.assertEqual(length,len(result.stdout)-4)
            self.assertEqual(json.loads(result.stdout[4:])['fields'][0]['value'],'fixture@example.test')
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
