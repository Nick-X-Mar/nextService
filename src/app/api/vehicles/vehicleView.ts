import { generatePresignedUrls } from '@/utils/s3Service'
import { normalizeEngineCC } from '@/app/api/vehicles/engineCC'

/**
 * A vehicle row as the owner's screens receive it.
 *
 * `licensePhotoUrl` is stored as an S3 key in a private bucket. Handing the key out
 * raw — as the saved-vehicles list and the PATCH response both did — gave the browser
 * a relative path that next/image throws on, and that no browser can load anyway. The
 * owner gets a short-lived presigned URL instead, the same as on the request routes.
 */
export async function presentVehicle(vehicle: Record<string, unknown>) {
  let licensePhotoUrl: string | null = null
  if (typeof vehicle.licensePhotoUrl === 'string' && vehicle.licensePhotoUrl) {
    try {
      ;[licensePhotoUrl] = await generatePresignedUrls([vehicle.licensePhotoUrl])
    } catch (error) {
      // A photo that can't be signed right now must not take the whole garage list
      // down with it; the card simply doesn't render.
      console.error('Could not presign licence photo for vehicle', vehicle.id, error)
    }
  }

  return {
    id: vehicle.id,
    clientId: vehicle.clientId,
    brand: vehicle.brand,
    model: vehicle.model,
    modelYear: vehicle.modelYear,
    // Legacy "1600cc" / "1.6" as digits, so the profile and step 1 can use the car.
    engineCC: vehicle.engineCC === undefined ? undefined : normalizeEngineCC(vehicle.engineCC),
    fuelType: vehicle.fuelType,
    isAutomatic: vehicle.isAutomatic,
    is4x4: vehicle.is4x4,
    isTurbo: vehicle.isTurbo,
    licensePlate: vehicle.licensePlate,
    engineNumber: vehicle.engineNumber,
    vinNumber: vehicle.vinNumber,
    color: vehicle.color,
    nickname: vehicle.nickname,
    licensePhotoUrl,
    isActive: vehicle.isActive,
    createdAt: vehicle.createdAt,
    updatedAt: vehicle.updatedAt,
  }
}
