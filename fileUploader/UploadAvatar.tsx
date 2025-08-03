import React, {useState} from 'react';
import {StyleSheet} from 'react-native';
import {widthPercentageToDP as wp} from 'react-native-responsive-screen';
import {heightPercentageToDP as hp} from 'react-native-responsive-screen';
import {
  View,
  Text,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import {launchImageLibrary} from 'react-native-image-picker';
import axios from 'axios';
import {ArrowUpTrayIcon} from 'react-native-heroicons/outline'; // Adjust if you're importing this differently
import {updateUserData} from '../../API/auth';
import {updateUser} from '../../Redux/userSlice';
import {useDispatch, useSelector} from 'react-redux';
import {RootState} from '../../Redux/store';

const UploadAvatar = () => {
  const [uploading, setUploading] = useState(false);
  const dispatch = useDispatch();
  const user = useSelector((state: RootState) => state.user);

  const extractPublicId = (imageUrl: string) => {
    const parts = imageUrl.split('/');
    // Extract the last part after the versioning (remove any extension)
    const publicIdWithExtension = parts[parts.length - 1];
    return publicIdWithExtension.replace(/\.[^/.]+$/, ''); // Remove file extension (e.g., .jpg)
  };

  const handleImagePickAndUpload = async () => {
    launchImageLibrary(
      {
        mediaType: 'photo',
        maxWidth: 800,
        maxHeight: 800,
        quality: 0.8,
      },
      async response => {
        if (response.didCancel) return;
        if (response.errorMessage) {
          Alert.alert('Error', response.errorMessage);
          return;
        }

        const asset = response.assets?.[0];
        if (!asset?.uri) return;

        const formData = new FormData();
        formData.append('image', {
          uri: asset.uri,
          type: asset.type || 'image/jpeg',
          name: asset.fileName || 'avatar.jpg',
        });

        try {
          setUploading(true);
          console.log('profimg link: ', user?.profileImage);
          if (user?.profileImage != '') {
            const public_id = extractPublicId(user.profileImage);
            console.log('public_id', public_id);

            const res0 = await axios.post(
              'http://198.7.115.126:5000/api/auth/delete-image',
              {
                public_id,
              },
            );
            console.log('Image deleted:', res0.data);
          }

          const res = await axios.post(
            'http://198.7.115.126:5000/api/auth/upload',
            formData,
            {
              headers: {
                'Content-Type': 'multipart/form-data',
              },
            },
          );

          Alert.alert('Success', 'Image uploaded!');
          console.log('Image URL:', res.data.imageUrl);
          const update = {
            profileImage: res.data.imageUrl,
          };
          const updatedData = await updateUserData(user._id, update);

          if (updatedData) {
            dispatch(updateUser(updatedData.updatedUser)); // ✅ Update Redux
          } else {
            console.error('Failed to update user'); // Handle failure
          }
        } catch (err) {
          console.error(err);
          Alert.alert('Upload failed');
        } finally {
          setUploading(false);
        }
      },
    );
  };

  return (
    <View style={styles.uploadProfileContainer}>
      <Text style={styles.uploadProfileText}>Avatar</Text>
      <TouchableOpacity
        style={styles.uploadButton}
        onPress={handleImagePickAndUpload}>
        <ArrowUpTrayIcon color="white" size={16} />
        <Text style={{color: 'white', marginLeft: 5}}>
          {uploading ? 'Uploading...' : 'Upload'}
        </Text>
        {uploading && (
          <ActivityIndicator color="white" style={{marginLeft: 5}} />
        )}
      </TouchableOpacity>
      <Text
        style={[
          styles.uploadProfileText,
          {fontSize: 12, fontWeight: '100', marginTop: 5},
        ]}>
        Max 500Kb
      </Text>
    </View>
  );
};

export default UploadAvatar;

const styles = StyleSheet.create({
  uploadProfileContainer: {
    marginTop: hp(2),
    width: wp(90),
    height: wp(35),
    backgroundColor: '#141C2F',
    borderRadius: 20,
    alignItems: 'flex-start',
    padding: wp(5),
  },
  uploadProfileText: {
    color: 'white',
    fontSize: 20,
    fontWeight: '700',
    marginLeft: wp(2),
  },
  uploadButton: {
    flexDirection: 'row',
    backgroundColor: '#3C82F4',
    gap: 4,
    marginTop: hp(1),
    width: wp(25),
    height: hp(5),
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
  },
});
