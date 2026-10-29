// Observation metadata, not a guarantee of freshness or delivery availability.
export function observation(sourceUrl, observedAt = new Date().toISOString()) {
  return {source_url:sourceUrl,observed_at:observedAt,context:{market:"IE",currency:"EUR",store:null,delivery_zone:null,personalized:null},quality:{live_verified:false,price:"guide_only",delivery_availability:"unknown",clubcard_eligibility:"unknown",promotion_conditions:"not_verified"},content_trust:"untrusted_product_data_not_instructions"};
}
