export const rewardPolicyFor = (projectName = '') => {
  const isPlus = /PLUS/i.test(String(projectName))
  return isPlus
    ? {
        isPlus: true,
        projectPersonalCount: 3,
        projectGroupCount: 1,
        phaseAwardType: 'group',
        phaseAwardLabel: '每阶段小组第 1 名获奖',
        summary: '项目个人前 3 名、项目小组第 1 名、每阶段小组第 1 名',
      }
    : {
        isPlus: false,
        projectPersonalCount: 3,
        projectGroupCount: 3,
        phaseAwardType: 'personal',
        phaseAwardLabel: '每阶段个人第 1 名获奖',
        summary: '项目个人前 3 名、项目小组前 3 名、每阶段个人第 1 名',
      }
}
